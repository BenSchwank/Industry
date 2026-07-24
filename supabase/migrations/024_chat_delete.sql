-- Chat löschen / Gruppe verlassen

CREATE OR REPLACE FUNCTION public.delete_chat_conversation(p_conversation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paths text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Chat fehlt';
  END IF;

  IF NOT public.is_chat_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diesen Chat';
  END IF;

  SELECT coalesce(array_agg(a.storage_path), ARRAY[]::text[])
  INTO paths
  FROM public.chat_attachments a
  JOIN public.chat_messages m ON m.id = a.message_id
  WHERE m.conversation_id = p_conversation_id;

  IF paths IS NOT NULL AND cardinality(paths) > 0 THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media'
      AND name = ANY (paths);
  END IF;

  DELETE FROM public.chat_conversations WHERE id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_chat_conversation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_chat_conversation(p_conversation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
  conv_kind text;
  paths text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Chat fehlt';
  END IF;

  IF NOT public.is_chat_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diesen Chat';
  END IF;

  SELECT kind INTO conv_kind
  FROM public.chat_conversations
  WHERE id = p_conversation_id;

  IF conv_kind IS NULL THEN
    RAISE EXCEPTION 'Chat nicht gefunden';
  END IF;

  IF conv_kind = 'dm' THEN
    PERFORM public.delete_chat_conversation(p_conversation_id);
    RETURN;
  END IF;

  DELETE FROM public.chat_members
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();

  SELECT count(*) INTO remaining
  FROM public.chat_members
  WHERE conversation_id = p_conversation_id;

  IF remaining = 0 THEN
    SELECT coalesce(array_agg(a.storage_path), ARRAY[]::text[])
    INTO paths
    FROM public.chat_attachments a
    JOIN public.chat_messages m ON m.id = a.message_id
    WHERE m.conversation_id = p_conversation_id;

    IF paths IS NOT NULL AND cardinality(paths) > 0 THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'chat-media'
        AND name = ANY (paths);
    END IF;

    DELETE FROM public.chat_conversations WHERE id = p_conversation_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_chat_conversation(UUID) TO authenticated;
