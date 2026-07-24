import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMessageInbox } from './useMessageInbox'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

function isUnreadRpcMissing(message: string) {
  return /count_unread_chat_messages|mark_chat_conversation_read|last_read_at|schema cache|could not find/i.test(
    message,
  )
}

/** Anzahl ungelesener Team-Chat-Nachrichten (von anderen). */
export function useChatUnreadCount() {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    queryKey: ['chat-unread-count', userId],
    enabled: Boolean(userId),
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('count_unread_chat_messages')
      if (error) {
        if (isUnreadRpcMissing(error.message)) return 0
        throw new Error(formatSupabaseError(error))
      }
      return typeof data === 'number' ? data : Number(data) || 0
    },
  })
}

/** Chat als gelesen markieren (beim Öffnen einer Unterhaltung). */
export function useMarkChatRead() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('mark_chat_conversation_read', {
        p_conversation_id: conversationId,
      })
      if (error) {
        if (isUnreadRpcMissing(error.message)) {
          const { error: upErr } = await supabase
            .from('chat_members')
            .update({ last_read_at: new Date().toISOString() } as never)
            .eq('conversation_id', conversationId)
            .eq('user_id', userId!)
          if (upErr && !isUnreadRpcMissing(upErr.message)) {
            throw new Error(formatSupabaseError(upErr))
          }
          return
        }
        throw new Error(formatSupabaseError(error))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chat-unread-count', userId] })
    },
  })
}

/** Badge-Zahlen für Nachrichten-Center und Chat. */
export function useNavBadges() {
  const { data: inbox = [] } = useMessageInbox()
  const { data: chatUnread = 0 } = useChatUnreadCount()

  const messagesCount = inbox.filter(
    (m) => m.severity === 'alert' || m.severity === 'warn',
  ).length

  return {
    messages: messagesCount,
    chat: chatUnread,
  }
}
