import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { listChatColleagues } from '../lib/listChatColleagues'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { assertLifecycleImage } from './useLifecyclePhotos'

export const CHAT_MEDIA_BUCKET = 'chat-media'
export const CHAT_SQL_HINT =
  'Team-Chat braucht einmalig: in Supabase → SQL → supabase/FIX_TEAM_CHAT.sql ausführen.'
export const CHAT_DELETE_SQL_HINT =
  'Chat löschen fehlt in der Datenbank. Bitte supabase/FIX_CHAT_DELETE.sql in Supabase ausführen.'

export type ChatKind = 'dm' | 'group'

export interface ChatConversation {
  id: string
  kind: ChatKind
  title: string | null
  created_at: string
  memberIds: string[]
  lastMessage: string | null
  lastAt: string | null
}

export interface ChatAttachment {
  id: string
  storage_path: string
  filename: string
  mime_type: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  body: string | null
  created_at: string
  attachments: ChatAttachment[]
}

function isChatSchemaMissing(message: string) {
  return /chat_conversations|chat_messages|chat_members|create_chat_conversation|schema cache|could not find/i.test(
    message,
  )
}

function isChatDeleteMissing(message: string) {
  return /delete_chat_conversation|leave_chat_conversation|schema cache|could not find.*function/i.test(
    message,
  )
}

function extForMime(mime: string, filename: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  const fromName = filename.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  return 'jpg'
}

export function useChatColleagues() {
  return useQuery({
    queryKey: ['chat-colleagues'],
    queryFn: listChatColleagues,
    staleTime: 60_000,
  })
}

export function useChatConversations() {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    queryKey: ['chat-conversations', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChatConversation[]> => {
      if (!userId) return []

      const { data: memberships, error: memErr } = await supabase
        .from('chat_members')
        .select('conversation_id')
        .eq('user_id', userId)

      if (memErr) {
        if (isChatSchemaMissing(memErr.message)) throw new Error(CHAT_SQL_HINT)
        throw new Error(formatSupabaseError(memErr))
      }

      const ids = [...new Set((memberships ?? []).map((m) => m.conversation_id))]
      if (ids.length === 0) return []

      const { data: convs, error: convErr } = await supabase
        .from('chat_conversations')
        .select('id, kind, title, created_at')
        .in('id', ids)
        .order('created_at', { ascending: false })

      if (convErr) {
        if (isChatSchemaMissing(convErr.message)) throw new Error(CHAT_SQL_HINT)
        throw new Error(formatSupabaseError(convErr))
      }

      const { data: allMembers } = await supabase
        .from('chat_members')
        .select('conversation_id, user_id')
        .in('conversation_id', ids)

      const membersByConv = new Map<string, string[]>()
      for (const row of allMembers ?? []) {
        const list = membersByConv.get(row.conversation_id) ?? []
        list.push(row.user_id)
        membersByConv.set(row.conversation_id, list)
      }

      const { data: recentMsgs } = await supabase
        .from('chat_messages')
        .select('conversation_id, body, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(200)

      const lastByConv = new Map<string, { body: string | null; created_at: string }>()
      for (const msg of recentMsgs ?? []) {
        if (!lastByConv.has(msg.conversation_id)) {
          lastByConv.set(msg.conversation_id, {
            body: msg.body,
            created_at: msg.created_at,
          })
        }
      }

      const list: ChatConversation[] = (convs ?? []).map((c) => {
        const last = lastByConv.get(c.id)
        return {
          id: c.id,
          kind: c.kind as ChatKind,
          title: c.title,
          created_at: c.created_at,
          memberIds: membersByConv.get(c.id) ?? [],
          lastMessage: last?.body ?? null,
          lastAt: last?.created_at ?? c.created_at,
        }
      })

      list.sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0
        return tb - ta
      })
      return list
    },
  })
}

export function useChatMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['chat-messages', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data: msgs, error } = await supabase
        .from('chat_messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(300)

      if (error) {
        if (isChatSchemaMissing(error.message)) throw new Error(CHAT_SQL_HINT)
        throw new Error(formatSupabaseError(error))
      }

      const messageIds = (msgs ?? []).map((m) => m.id)
      let attachments: Array<{
        id: string
        message_id: string
        storage_path: string
        filename: string
        mime_type: string
      }> = []

      if (messageIds.length > 0) {
        const { data: atts } = await supabase
          .from('chat_attachments')
          .select('id, message_id, storage_path, filename, mime_type')
          .in('message_id', messageIds)
        attachments = atts ?? []
      }

      const byMsg = new Map<string, ChatAttachment[]>()
      for (const a of attachments) {
        const list = byMsg.get(a.message_id) ?? []
        list.push({
          id: a.id,
          storage_path: a.storage_path,
          filename: a.filename,
          mime_type: a.mime_type,
        })
        byMsg.set(a.message_id, list)
      }

      return (msgs ?? []).map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        attachments: byMsg.get(m.id) ?? [],
      }))
    },
  })
}

export function useChatRealtime(conversationId: string | null) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`team-chat-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['chat-conversations', userId] })
          if (conversationId) {
            void queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_members' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['chat-conversations', userId] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, conversationId, queryClient])
}

export function useCreateChat() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (input: {
      kind: ChatKind
      title?: string | null
      memberIds: string[]
    }) => {
      const { data, error } = await supabase.rpc('create_chat_conversation', {
        p_kind: input.kind,
        p_title: input.title ?? null,
        p_member_ids: input.memberIds,
      })
      if (error) {
        if (isChatSchemaMissing(error.message)) throw new Error(CHAT_SQL_HINT)
        throw new Error(formatSupabaseError(error))
      }
      return data as string
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chat-conversations', userId] })
    },
  })
}

export function useSendChatMessage() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (input: {
      conversationId: string
      body?: string
      files?: File[]
    }) => {
      if (!userId) throw new Error('Bitte anmelden')
      const text = input.body?.trim() || null
      const files = input.files ?? []
      if (!text && files.length === 0) throw new Error('Nachricht oder Bild nötig')

      const messageId = crypto.randomUUID()
      const { error: msgErr } = await supabase.from('chat_messages').insert({
        id: messageId,
        conversation_id: input.conversationId,
        sender_id: userId,
        body: text,
      })
      if (msgErr) {
        if (isChatSchemaMissing(msgErr.message)) throw new Error(CHAT_SQL_HINT)
        throw new Error(formatSupabaseError(msgErr))
      }

      for (const file of files.slice(0, 4)) {
        const mime = assertLifecycleImage(file)
        const attId = crypto.randomUUID()
        const ext = extForMime(mime, file.name)
        const storagePath = `${input.conversationId}/${messageId}/${attId}.${ext}`

        const { error: upErr } = await supabase.storage
          .from(CHAT_MEDIA_BUCKET)
          .upload(storagePath, file, { contentType: mime, upsert: false })
        if (upErr) throw new Error(formatSupabaseError(upErr))

        const { error: attErr } = await supabase.from('chat_attachments').insert({
          id: attId,
          message_id: messageId,
          storage_path: storagePath,
          filename: file.name || `bild.${ext}`,
          mime_type: mime,
          file_size_bytes: file.size,
        })
        if (attErr) {
          await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([storagePath])
          throw new Error(formatSupabaseError(attErr))
        }
      }

      return messageId
    },
    onSuccess: (_id, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['chat-messages', vars.conversationId] })
      void queryClient.invalidateQueries({ queryKey: ['chat-conversations', userId] })
    },
  })
}

export function useDeleteChat() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('delete_chat_conversation', {
        p_conversation_id: conversationId,
      })
      if (error) {
        if (isChatDeleteMissing(error.message) || isChatSchemaMissing(error.message)) {
          throw new Error(CHAT_DELETE_SQL_HINT)
        }
        throw new Error(formatSupabaseError(error))
      }
    },
    onSuccess: (_void, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ['chat-conversations', userId] })
      void queryClient.removeQueries({ queryKey: ['chat-messages', conversationId] })
    },
  })
}

export function useLeaveChat() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('leave_chat_conversation', {
        p_conversation_id: conversationId,
      })
      if (error) {
        if (isChatDeleteMissing(error.message) || isChatSchemaMissing(error.message)) {
          throw new Error(CHAT_DELETE_SQL_HINT)
        }
        throw new Error(formatSupabaseError(error))
      }
    },
    onSuccess: (_void, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ['chat-conversations', userId] })
      void queryClient.removeQueries({ queryKey: ['chat-messages', conversationId] })
    },
  })
}

export function useChatAttachmentUrl(storagePath: string | null) {
  return useQuery({
    queryKey: ['chat-attachment-url', storagePath],
    enabled: Boolean(storagePath),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl(storagePath!, 3600)
      if (error) throw new Error(formatSupabaseError(error))
      return data.signedUrl
    },
  })
}
