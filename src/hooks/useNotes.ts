import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Database } from '../types/database'

export const NOTES_SQL_HINT =
  'Notizen brauchen einmalig: in Supabase → SQL → supabase/FIX_USER_NOTES.sql ausführen.'

export type UserNote = Database['public']['Tables']['user_notes']['Row']

function isNotesSchemaMissing(message: string) {
  return /user_notes|schema cache|could not find.*table/i.test(message)
}

function notesError(error: { message: string }) {
  if (isNotesSchemaMissing(error.message)) {
    return new Error(NOTES_SQL_HINT)
  }
  return new Error(formatSupabaseError(error))
}

export function useUserNotes() {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    queryKey: ['user-notes', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<UserNote[]> => {
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw notesError(error)
      return (data ?? []) as UserNote[]
    },
  })
}

export function useCreateUserNote() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input?: { title?: string; body?: string }): Promise<UserNote> => {
      if (!userId) throw new Error('Nicht angemeldet')
      const { data, error } = await supabase
        .from('user_notes')
        .insert({
          owner_id: userId,
          title: input?.title?.trim() || 'Neue Notiz',
          body: input?.body ?? '',
          is_public: false,
        })
        .select('*')
        .single()

      if (error) throw notesError(error)
      return data as UserNote
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-notes'] })
    },
  })
}

export function useUpdateUserNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      title?: string
      body?: string
      is_public?: boolean
    }): Promise<UserNote> => {
      const patch: Database['public']['Tables']['user_notes']['Update'] = {}
      if (input.title !== undefined) patch.title = input.title.trim() || 'Neue Notiz'
      if (input.body !== undefined) patch.body = input.body
      if (input.is_public !== undefined) patch.is_public = input.is_public

      const { data, error } = await supabase
        .from('user_notes')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single()

      if (error) throw notesError(error)
      return data as UserNote
    },
    onSuccess: (row) => {
      queryClient.setQueryData<UserNote[]>(['user-notes', row.owner_id], (prev) => {
        if (!prev) return prev
        return prev
          .map((n) => (n.id === row.id ? row : n))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      })
      void queryClient.invalidateQueries({ queryKey: ['user-notes'] })
    },
  })
}

export function useDeleteUserNote() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('user_notes').delete().eq('id', id)
      if (error) throw notesError(error)
    },
    onSuccess: (_void, id) => {
      if (userId) {
        queryClient.setQueryData<UserNote[]>(['user-notes', userId], (prev) =>
          prev?.filter((n) => n.id !== id),
        )
      }
      void queryClient.invalidateQueries({ queryKey: ['user-notes'] })
    },
  })
}
