import { supabase } from '../supabase'
import { normalizeBarcode, BARCODE_PREFIX } from '../barcode'
import type { QS1ImportRow } from './qs1Parser'

export interface ImportStats {
  machinesCreated: number
  machinesUpdated: number
  tasksCreated: number
  tasksUpdated: number
  checklistItems: number
  skipped: number
  errors: string[]
}

function qs1Barcode(externalId: string): string {
  const clean = externalId.replace(/[^A-Z0-9-]/gi, '-').toUpperCase()
  return normalizeBarcode(`${BARCODE_PREFIX.machine}-${clean}`)
}

export async function importQS1Rows(
  rows: QS1ImportRow[],
  filename?: string,
): Promise<ImportStats> {
  const stats: ImportStats = {
    machinesCreated: 0,
    machinesUpdated: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    checklistItems: 0,
    skipped: 0,
    errors: [],
  }

  for (const row of rows) {
    try {
      const barcode = qs1Barcode(row.externalId)
      const externalId = row.externalId.trim()

      let machineId: string | null = null

      const { data: existingByExt } = await supabase
        .from('machines')
        .select('id')
        .eq('external_source', 'qs1')
        .eq('external_id', externalId)
        .maybeSingle()

      if (existingByExt) {
        machineId = existingByExt.id
        await supabase
          .from('machines')
          .update({
            name: row.machineName,
            location: row.location,
          })
          .eq('id', machineId)
        stats.machinesUpdated++
      } else {
        const { data: existingByBarcode } = await supabase
          .from('machines')
          .select('id')
          .eq('barcode', barcode)
          .maybeSingle()

        if (existingByBarcode) {
          machineId = existingByBarcode.id
          await supabase
            .from('machines')
            .update({
              name: row.machineName,
              location: row.location,
              external_id: externalId,
              external_source: 'qs1',
            })
            .eq('id', machineId)
          stats.machinesUpdated++
        } else {
          const { data: created, error } = await supabase
            .from('machines')
            .insert({
              barcode,
              name: row.machineName,
              location: row.location,
              external_id: externalId,
              external_source: 'qs1',
              status: 'active',
            })
            .select('id')
            .single()

          if (error) throw error
          machineId = created.id
          stats.machinesCreated++
        }
      }

      if (!machineId) {
        stats.skipped++
        continue
      }

      const taskExternalId = `${externalId}::${row.taskTitle}`

      const { data: existingTask } = await supabase
        .from('maintenance_tasks')
        .select('id')
        .eq('external_source', 'qs1')
        .eq('external_id', taskExternalId)
        .maybeSingle()

      let taskId: string

      if (existingTask) {
        taskId = existingTask.id
        await supabase
          .from('maintenance_tasks')
          .update({
            frequency_days: row.frequencyDays,
            next_due_date: row.nextDueDate,
            title: row.taskTitle,
          })
          .eq('id', taskId)
        stats.tasksUpdated++
      } else {
        const { data: newTask, error: taskError } = await supabase
          .from('maintenance_tasks')
          .insert({
            machine_id: machineId,
            title: row.taskTitle,
            frequency_days: row.frequencyDays,
            next_due_date: row.nextDueDate,
            external_id: taskExternalId,
            external_source: 'qs1',
          })
          .select('id')
          .single()

        if (taskError) throw taskError
        taskId = newTask.id
        stats.tasksCreated++
      }

      if (row.checklistItems.length > 0) {
        await supabase
          .from('maintenance_checklist_items')
          .delete()
          .eq('task_id', taskId)

        const items = row.checklistItems.map((label, idx) => ({
          task_id: taskId,
          label,
          sort_order: idx + 1,
        }))

        const { error: itemsError } = await supabase
          .from('maintenance_checklist_items')
          .insert(items)

        if (itemsError) throw itemsError
        stats.checklistItems += items.length
      }
    } catch (err) {
      stats.errors.push(
        `${row.externalId}: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      )
      stats.skipped++
    }
  }

  await supabase.from('import_runs').insert({
    source: 'qs1',
    filename: filename ?? null,
    rows_total: rows.length,
    rows_imported: rows.length - stats.skipped,
    rows_skipped: stats.skipped,
    errors: stats.errors,
  })

  return stats
}
