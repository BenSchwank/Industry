import { normalizeBarcode, BARCODE_PREFIX } from '../barcode'
import { supabase } from '../supabase'
import type { QS1ImportRow } from './qs1Parser'

export type ImportAction = 'create' | 'update'

export interface QS1PreviewTask {
  title: string
  frequencyDays: number
  nextDueDate: string
  checklistItems: string[]
  action: ImportAction
}

export interface QS1PreviewMachine {
  externalId: string
  name: string
  location: string | null
  barcode: string
  action: ImportAction
  tasks: QS1PreviewTask[]
}

export interface QS1PreviewSummary {
  machines: QS1PreviewMachine[]
  totalRows: number
  newMachines: number
  updatedMachines: number
  newTasks: number
  updatedTasks: number
  totalChecklistItems: number
}

function qs1Barcode(externalId: string): string {
  const clean = externalId.replace(/[^A-Z0-9-]/gi, '-').toUpperCase()
  return normalizeBarcode(`${BARCODE_PREFIX.machine}-${clean}`)
}

export function groupRowsForPreview(rows: QS1ImportRow[]): QS1PreviewMachine[] {
  const map = new Map<string, QS1PreviewMachine>()

  for (const row of rows) {
    const key = row.externalId.trim()
    let machine = map.get(key)
    if (!machine) {
      machine = {
        externalId: key,
        name: row.machineName,
        location: row.location,
        barcode: qs1Barcode(key),
        action: 'create',
        tasks: [],
      }
      map.set(key, machine)
    }

    machine.tasks.push({
      title: row.taskTitle,
      frequencyDays: row.frequencyDays,
      nextDueDate: row.nextDueDate,
      checklistItems: row.checklistItems,
      action: 'create',
    })
  }

  return Array.from(map.values())
}

export async function buildQS1Preview(rows: QS1ImportRow[]): Promise<QS1PreviewSummary> {
  const machines = groupRowsForPreview(rows)

  const externalIds = machines.map((m) => m.externalId)
  const barcodes = machines.map((m) => m.barcode)

  const [byExt, byBarcode, allTasks] = await Promise.all([
    supabase
      .from('machines')
      .select('id, external_id, barcode')
      .eq('external_source', 'qs1')
      .in('external_id', externalIds.length ? externalIds : ['__none__']),
    supabase.from('machines').select('id, barcode').in('barcode', barcodes.length ? barcodes : ['__none__']),
    supabase
      .from('maintenance_tasks')
      .select('external_id')
      .eq('external_source', 'qs1'),
  ])

  const existingExt = new Set((byExt.data ?? []).map((m) => m.external_id))
  const existingBarcode = new Set((byBarcode.data ?? []).map((m) => m.barcode))
  const existingTasks = new Set((allTasks.data ?? []).map((t) => t.external_id))

  let newMachines = 0
  let updatedMachines = 0
  let newTasks = 0
  let updatedTasks = 0
  let totalChecklistItems = 0

  for (const machine of machines) {
    const exists = existingExt.has(machine.externalId) || existingBarcode.has(machine.barcode)
    machine.action = exists ? 'update' : 'create'
    if (exists) updatedMachines++
    else newMachines++

    for (const task of machine.tasks) {
      const taskKey = `${machine.externalId}::${task.title}`
      task.action = existingTasks.has(taskKey) ? 'update' : 'create'
      if (task.action === 'update') updatedTasks++
      else newTasks++
      totalChecklistItems += task.checklistItems.length
    }
  }

  return {
    machines,
    totalRows: rows.length,
    newMachines,
    updatedMachines,
    newTasks,
    updatedTasks,
    totalChecklistItems,
  }
}
