import { formatDurationDays, maintenanceDueTone } from '../../lib/maintenanceDue'
import { isHuTaskTitle } from '../../lib/maintenanceTaskType'

export interface MaintenanceTaskRow {
  id: string
  title: string
  frequency_days: number
  next_due_date: string
  machine_id: string
  machines: { name: string; barcode: string } | null
}

interface MaintenanceTaskCardProps {
  task: MaintenanceTaskRow
  busy: boolean
  deletePending: boolean
  completePending: boolean
  onComplete: () => void
  onEdit: () => void
  onDetails: () => void
  onDelete: () => void
}

export function MaintenanceTaskCard({
  task,
  busy,
  deletePending,
  completePending,
  onComplete,
  onEdit,
  onDetails,
  onDelete,
}: MaintenanceTaskCardProps) {
  const machine = task.machines
  const tone = maintenanceDueTone(task.next_due_date)
  const dueDate = new Date(task.next_due_date)
  const isHu = isHuTaskTitle(task.title)

  return (
    <article
      className={`rounded-xl p-4 ${
        tone === 'overdue'
          ? 'border-kwd-danger bg-kwd-danger/10 border-2'
          : tone === 'soon'
            ? 'border-kwd-warning bg-kwd-warning/10 border-2'
            : 'bg-kwd-surface border-kwd-border border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-kwd-primary text-xs font-bold">
            {machine?.barcode}
            {isHu ? ' · Wartung / HU' : ' · Geplante Reparatur'}
          </p>
          <h3 className="font-bold">{task.title}</h3>
          <p className="text-kwd-muted text-sm">{machine?.name}</p>
        </div>
        <button
          type="button"
          disabled={busy || deletePending}
          onClick={onDelete}
          className="kwd-btn kwd-btn-danger shrink-0 px-2 text-xs"
          title="Aufgabe entfernen (ohne Abschluss)"
        >
          Entfernen
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span
          className={
            tone === 'overdue'
              ? 'text-kwd-danger font-semibold'
              : tone === 'soon'
                ? 'text-kwd-warning font-semibold'
                : ''
          }
        >
          {isHu ? 'Nächste HU: ' : 'Geplant: '}
          {dueDate.toLocaleDateString('de-DE')}
          {tone === 'overdue' && ' · überfällig'}
          {tone === 'soon' && ' · bald'}
        </span>
        {isHu && (
          <span className="text-kwd-muted">Dauer: {formatDurationDays(task.frequency_days)}</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || completePending}
          onClick={onComplete}
          className="kwd-btn kwd-btn-primary min-h-[44px] flex-1"
        >
          {busy ? 'Speichern…' : 'Erledigt'}
        </button>
        <button type="button" disabled={busy} onClick={onEdit} className="kwd-btn min-h-[44px] flex-1">
          Bearbeiten
        </button>
        <button type="button" onClick={onDetails} className="kwd-btn min-h-[44px] flex-1">
          Details
        </button>
      </div>
    </article>
  )
}
