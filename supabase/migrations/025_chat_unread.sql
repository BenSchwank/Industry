-- Ungelesene Chat-Nachrichten
ALTER TABLE public.chat_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

UPDATE public.chat_members
SET last_read_at = COALESCE(last_read_at, joined_at, now())
WHERE last_read_at IS NULL;

DROP POLICY IF EXISTS "Chat members update self" ON public.chat_members;
CREATE POLICY "Chat members update self" ON public.chat_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_chat_conversation_read(p_conversation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF NOT public.is_chat_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diesen Chat';
  END IF;

  UPDATE public.chat_members
  SET last_read_at = now()
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_conversation_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_unread_chat_messages()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*)::integer, 0)
  FROM public.chat_messages m
  JOIN public.chat_members mem
    ON mem.conversation_id = m.conversation_id
   AND mem.user_id = auth.uid()
  WHERE m.sender_id IS DISTINCT FROM auth.uid()
    AND m.created_at > coalesce(mem.last_read_at, mem.joined_at, 'epoch'::timestamptz);
$$;

GRANT EXECUTE ON FUNCTION public.count_unread_chat_messages() TO authenticated;
