import { supabase } from './supabase'
import { analyzeMaintenanceWithAi, callEdgeFunctionAnalysis } from './aiMaintenanceAnalysis'
import { queryClient } from './queryClient'

const QUEUE_KEY = 'kwd-ai-analysis-queue'

export interface AiAnalysisJob {
  id: string
  attachmentId: string
  machineId: string
  storagePath: string
  filename: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  error?: string
  createdAt: string
}

function loadQueue(): AiAnalysisJob[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as AiAnalysisJob[]
  } catch {
    return []
  }
}

function saveQueue(jobs: AiAnalysisJob[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs))
}

export function enqueueAiAnalysis(job: Omit<AiAnalysisJob, 'id' | 'status' | 'createdAt'>) {
  const jobs = loadQueue()
  const entry: AiAnalysisJob = {
    ...job,
    id: crypto.randomUUID(),
    status: 'queued',
    createdAt: new Date().toISOString(),
  }
  jobs.push(entry)
  saveQueue(jobs)
  processAiQueue()
  return entry.id
}

let processing = false

export async function processAiQueue() {
  if (processing) return
  processing = true

  try {
    const jobs = loadQueue()
    const next = jobs.find((j) => j.status === 'queued')
    if (!next) return

    next.status = 'processing'
    saveQueue(jobs)

    await supabase
      .from('machine_attachments')
      .update({ ai_analysis_status: 'processing' })
      .eq('id', next.attachmentId)

    try {
      let plan
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const useEdge = import.meta.env.VITE_USE_EDGE_AI === 'true'

      if (useEdge && supabaseUrl && anonKey) {
        plan = await callEdgeFunctionAnalysis(next.attachmentId, supabaseUrl, anonKey)
      } else {
        const { data: fileData, error } = await supabase.storage
          .from('machine-documents')
          .download(next.storagePath)
        if (error) throw error
        plan = await analyzeMaintenanceWithAi(await fileData.arrayBuffer())
      }

      const { data: draft, error: draftError } = await supabase
        .from('maintenance_plan_drafts')
        .insert({
          machine_id: next.machineId,
          attachment_id: next.attachmentId,
          title: plan.title,
          frequency_days: plan.frequency_days,
          status: 'ready',
          source: 'ai',
          ai_model: import.meta.env.VITE_USE_EDGE_AI === 'true' ? 'edge' : 'gpt-4o-mini',
        })
        .select('id')
        .single()

      if (draftError) throw draftError

      if (plan.checklist_items.length > 0) {
        await supabase.from('maintenance_draft_checklist_items').insert(
          plan.checklist_items.map((label, i) => ({
            draft_id: draft.id,
            label,
            sort_order: i + 1,
          })),
        )
      }

      await supabase
        .from('machine_attachments')
        .update({
          ai_analysis_status: 'done',
          analysis_summary: plan.summary,
        })
        .eq('id', next.attachmentId)

      next.status = 'done'
    } catch (err) {
      next.status = 'failed'
      next.error = err instanceof Error ? err.message : 'Analyse fehlgeschlagen'
      await supabase
        .from('machine_attachments')
        .update({ ai_analysis_status: 'failed' })
        .eq('id', next.attachmentId)
    }

    saveQueue(jobs.filter((j) => j.status !== 'done'))

    queryClient.invalidateQueries({ queryKey: ['maintenance-drafts', next.machineId] })
    queryClient.invalidateQueries({ queryKey: ['machine-attachments', next.machineId] })
    queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
    queryClient.invalidateQueries({ queryKey: ['message-inbox'] })

    if (loadQueue().some((j) => j.status === 'queued')) {
      setTimeout(() => processAiQueue(), 500)
    }
  } finally {
    processing = false
  }
}

export function getAiQueueStatus(machineId: string) {
  return loadQueue().filter((j) => j.machineId === machineId)
}
