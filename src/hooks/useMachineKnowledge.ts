import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatSupabaseError } from '../lib/formatError'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export const MACHINE_KNOWLEDGE_SQL_HINT =
  'Maschinenwissen braucht einmalig: in Supabase → SQL → supabase/FIX_MACHINE_KNOWLEDGE.sql ausführen.'

export type MachineKnowledgePage =
  Database['public']['Tables']['machine_knowledge_pages']['Row']

function isSchemaMissing(message: string) {
  return /machine_knowledge_pages|schema cache|could not find.*table/i.test(message)
}

function knowledgeError(error: { message: string }) {
  if (isSchemaMissing(error.message)) return new Error(MACHINE_KNOWLEDGE_SQL_HINT)
  return new Error(formatSupabaseError(error))
}

export function legacyKnowledgeKey(machineId: string) {
  return `kwd-machine-knowledge-${machineId}`
}

export function readLegacyKnowledge(machineId: string): string {
  try {
    return localStorage.getItem(legacyKnowledgeKey(machineId)) ?? ''
  } catch {
    return ''
  }
}

export function clearLegacyKnowledge(machineId: string) {
  try {
    localStorage.removeItem(legacyKnowledgeKey(machineId))
  } catch {
    /* ignore */
  }
}

export function useMachineKnowledgePages(machineId: string | null) {
  return useQuery({
    queryKey: ['machine-knowledge', machineId],
    enabled: Boolean(machineId),
    queryFn: async (): Promise<MachineKnowledgePage[]> => {
      const { data, error } = await supabase
        .from('machine_knowledge_pages')
        .select('*')
        .eq('machine_id', machineId!)
        .order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false })

      if (error) throw knowledgeError(error)
      return (data ?? []) as MachineKnowledgePage[]
    },
  })
}

export function useCreateKnowledgePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      machineId: string
      title?: string
      body?: string
      sortOrder?: number
    }): Promise<MachineKnowledgePage> => {
      const { data, error } = await supabase
        .from('machine_knowledge_pages')
        .insert({
          machine_id: input.machineId,
          title: input.title?.trim() || 'Neue Seite',
          body: input.body ?? '',
          sort_order: input.sortOrder ?? 0,
        })
        .select('*')
        .single()

      if (error) throw knowledgeError(error)
      return data as MachineKnowledgePage
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ['machine-knowledge', row.machine_id] })
    },
  })
}

export function useUpdateKnowledgePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      machineId: string
      title?: string
      body?: string
    }): Promise<MachineKnowledgePage> => {
      const patch: Database['public']['Tables']['machine_knowledge_pages']['Update'] = {}
      if (input.title !== undefined) patch.title = input.title.trim() || 'Neue Seite'
      if (input.body !== undefined) patch.body = input.body

      const { data, error } = await supabase
        .from('machine_knowledge_pages')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single()

      if (error) throw knowledgeError(error)
      return data as MachineKnowledgePage
    },
    onSuccess: (row) => {
      queryClient.setQueryData<MachineKnowledgePage[]>(
        ['machine-knowledge', row.machine_id],
        (prev) => {
          if (!prev) return prev
          return prev.map((p) => (p.id === row.id ? row : p))
        },
      )
      void queryClient.invalidateQueries({ queryKey: ['machine-knowledge', row.machine_id] })
    },
  })
}

export function useDeleteKnowledgePage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; machineId: string }): Promise<void> => {
      const { error } = await supabase
        .from('machine_knowledge_pages')
        .delete()
        .eq('id', input.id)
      if (error) throw knowledgeError(error)
    },
    onSuccess: (_void, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['machine-knowledge', vars.machineId] })
    },
  })
}
