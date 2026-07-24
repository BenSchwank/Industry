-- Team-Chat: Direktnachrichten, Gruppen, Bilder
-- Einmal im Supabase SQL-Editor ausführen

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'group')),
  title TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_members (
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user
  ON public.chat_members (user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_body_or_later CHECK (body IS NULL OR length(trim(body)) >= 0)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message
  ON public.chat_attachments (message_id);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_member(conv_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members m
    WHERE m.conversation_id = conv_id AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "Chat members read conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Chat auth insert conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Chat members read members" ON public.chat_members;
DROP POLICY IF EXISTS "Chat auth insert members" ON public.chat_members;
DROP POLICY IF EXISTS "Chat members read messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat members insert messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat members read attachments" ON public.chat_attachments;
DROP POLICY IF EXISTS "Chat members insert attachments" ON public.chat_attachments;

CREATE POLICY "Chat members read conversations" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (public.is_chat_member(id));

CREATE POLICY "Chat auth insert conversations" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Chat members read members" ON public.chat_members
  FOR SELECT TO authenticated
  USING (public.is_chat_member(conversation_id) OR user_id = auth.uid());

CREATE POLICY "Chat auth insert members" ON public.chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_chat_member(conversation_id)
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "Chat members read messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.is_chat_member(conversation_id));

CREATE POLICY "Chat members insert messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_member(conversation_id)
  );

CREATE POLICY "Chat members read attachments" ON public.chat_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages msg
      WHERE msg.id = message_id AND public.is_chat_member(msg.conversation_id)
    )
  );

CREATE POLICY "Chat members insert attachments" ON public.chat_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_messages msg
      WHERE msg.id = message_id
        AND msg.sender_id = auth.uid()
        AND public.is_chat_member(msg.conversation_id)
    )
  );

-- Conversation anlegen + Mitglieder (inkl. sich selbst)
CREATE OR REPLACE FUNCTION public.create_chat_conversation(
  p_kind TEXT,
  p_title TEXT,
  p_member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id UUID;
  mid UUID;
  all_ids UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;
  IF p_kind NOT IN ('dm', 'group') THEN
    RAISE EXCEPTION 'Ungültiger Chat-Typ';
  END IF;

  all_ids := ARRAY(SELECT DISTINCT unnest(COALESCE(p_member_ids, ARRAY[]::UUID[]) || ARRAY[auth.uid()]));

  IF p_kind = 'dm' THEN
    IF array_length(all_ids, 1) <> 2 THEN
      RAISE EXCEPTION 'Direktnachricht braucht genau eine andere Person';
    END IF;

    SELECT c.id INTO conv_id
    FROM public.chat_conversations c
    WHERE c.kind = 'dm'
      AND (
        SELECT count(*) FROM public.chat_members m WHERE m.conversation_id = c.id
      ) = 2
      AND (
        SELECT count(*) FROM public.chat_members m
        WHERE m.conversation_id = c.id AND m.user_id = ANY (all_ids)
      ) = 2
    LIMIT 1;

    IF conv_id IS NOT NULL THEN
      RETURN conv_id;
    END IF;
  END IF;

  IF p_kind = 'group' AND array_length(all_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Gruppe braucht mindestens einen Kollegen';
  END IF;

  INSERT INTO public.chat_conversations (kind, title, created_by)
  VALUES (
    p_kind,
    CASE WHEN p_kind = 'group' THEN NULLIF(trim(COALESCE(p_title, '')), '') ELSE NULL END,
    auth.uid()
  )
  RETURNING id INTO conv_id;

  FOREACH mid IN ARRAY all_ids LOOP
    INSERT INTO public.chat_members (conversation_id, user_id)
    VALUES (conv_id, mid)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_chat_conversation(TEXT, TEXT, UUID[]) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  12582912,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Chat media read" ON storage.objects;
DROP POLICY IF EXISTS "Chat media write" ON storage.objects;
DROP POLICY IF EXISTS "Chat media update" ON storage.objects;
DROP POLICY IF EXISTS "Chat media delete" ON storage.objects;

CREATE POLICY "Chat media read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media');

CREATE POLICY "Chat media write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Chat media update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-media')
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Chat media delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media');

-- Realtime für live Nachrichten
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
