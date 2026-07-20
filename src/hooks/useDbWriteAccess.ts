import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatError'

async function probeWriteAccess(): Promise<{ ok: true } | { ok: false; message: string }> {
  const code = `KWD-M-PROBE-${Date.now().toString(36).toUpperCase()}`
  const { data, error } = await supabase
    .from('machines')
    .insert({
      barcode: code,
      name: '__schreibtest__',
      location: '__probe__',
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    return { ok: false, message: formatSupabaseError(error) }
  }

  await supabase.from('machines').delete().eq('id', data.id)
  return { ok: true }
}

export function useDbWriteAccess() {
  return useQuery({
    queryKey: ['db-write-access'],
    queryFn: probeWriteAccess,
    staleTime: 1000 * 60 * 30,
    retry: false,
  })
}
