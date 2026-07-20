import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { formatUptime, formatUptimeCompact, uptimeHealthClass } from '../../lib/machineHealth'
import { normalizeBarcode } from '../../lib/barcode'
import { formatSupabaseError } from '../../lib/formatError'
import { useUpdateMachine } from '../../hooks/useMachines'
import type { MachineWithStats } from '../../hooks/useMachinesWithStats'
import { useMachineHealth } from '../../hooks/useMachineHealth'
import type { TimelineItem } from '../../hooks/useMachineLifecycle'
import type { MachineStatus } from '../../types/database'
import { LoadingFallback } from '../ui/LoadingFallback'
import { MachineLifecyclePanel } from './MachineLifecyclePanel'
import { MachineProblemPanel } from './MachineProblemPanel'

const MachineAttachmentsPanel = lazy(() =>
  import('./MachineAttachmentsPanel').then((m) => ({ default: m.MachineAttachmentsPanel })),
)
const MachineKnowledgePanel = lazy(() =>
  import('./MachineKnowledgePanel').then((m) => ({ default: m.MachineKnowledgePanel })),
)
const MachinePlansPanel = lazy(() =>
  import('./MachinePlansPanel').then((m) => ({ default: m.MachinePlansPanel })),
)

type DetailTab = 'overview' | 'problems' | 'history' | 'documents' | 'plans' | 'knowledge'

const BASE_TABS: { id: DetailTab; label: string; short: string }[] = [
  { id: 'overview', label: 'Stammdaten', short: 'Daten' },
  { id: 'problems', label: 'Störungen', short: 'Stör.' },
  { id: 'history', label: 'Verlauf', short: 'Verl.' },
  { id: 'documents', label: 'Unterlagen', short: 'Docs' },
  { id: 'knowledge', label: 'Wissen', short: 'Wiss.' },
]

const STATUS_OPTIONS: { value: MachineStatus; label: string }[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'maintenance', label: 'In Wartung' },
  { value: 'offline', label: 'Offline' },
  { value: 'decommissioned', label: 'Außer Betrieb' },
]

const fieldCls =
  'border-kwd-border bg-kwd-paper text-kwd-text mt-1 min-h-[40px] w-full border px-3 text-sm'

function formatDate(d: string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('de-DE')
}

function toDateInput(d: string | null) {
  if (!d) return ''
  return d.slice(0, 10)
}

function filterTimeline(timeline: TimelineItem[], query: string): TimelineItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return timeline
  const terms = q.split(/\s+/).filter(Boolean)
  return timeline.filter((item) => {
    const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

interface MachineDetailPanelProps {
  machine: MachineWithStats
  timeline: TimelineItem[]
  timelineLoading: boolean
  isDesktop: boolean
  focusMode?: boolean
  compact?: boolean
  fullscreen?: boolean
  onToggleFullscreen?: () => void
  onClose: () => void
}

export function MachineDetailPanel({
  machine,
  timeline,
  timelineLoading,
  compact,
  fullscreen,
  onToggleFullscreen,
  onClose,
}: MachineDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const { data: health, isLoading: healthLoading } = useMachineHealth(machine.id)

  const filteredTimeline = useMemo(
    () => filterTimeline(timeline, searchQuery),
    [timeline, searchQuery],
  )

  const maintenanceOverdue =
    machine.next_maintenance_at && new Date(machine.next_maintenance_at) < new Date()

  const showPlansTab =
    machine.documents_analyzed > 0 ||
    machine.plan_status === 'ready' ||
    machine.plan_status === 'draft' ||
    machine.plan_status === 'processing' ||
    machine.plan_status === 'analyzed'

  const tabs = useMemo(() => {
    const list = [...BASE_TABS]
    if (showPlansTab) {
      const docsIdx = list.findIndex((t) => t.id === 'documents')
      list.splice(docsIdx + 1, 0, { id: 'plans', label: 'Pläne', short: 'Pläne' })
    }
    return list
  }, [showPlansTab])

  useEffect(() => {
    setTab('overview')
    setSearchQuery('')
  }, [machine.id])

  useEffect(() => {
    if (tab === 'plans' && !showPlansTab) setTab('documents')
  }, [tab, showPlansTab])

  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (onToggleFullscreen) onToggleFullscreen()
        else onClose()
      }
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen, onToggleFullscreen, onClose])

  const content = (
    <>
      {tab === 'overview' && (
        <MachineStammdatenForm
          machine={machine}
          compact={Boolean(compact && !fullscreen)}
          healthLoading={healthLoading}
          uptimeDays={health?.uptimeDays ?? null}
          uptimeClass={uptimeHealthClass(
            health?.uptimeDays ?? null,
            health?.hasOpenTickets ?? false,
          )}
          healthHint={
            health?.hasOpenTickets
              ? `${health.openTicketCount} offen`
              : health?.lastResolvedAt
                ? `Seit ${formatDate(health.lastResolvedAt)}`
                : 'Kein Ticketabschluss'
          }
          maintenanceOverdue={Boolean(maintenanceOverdue)}
        />
      )}

      {tab === 'problems' && (
        <MachineProblemPanel machineId={machine.id} machineName={machine.name} />
      )}

      {tab === 'history' && (
        <div className="flex flex-col gap-2">
          <label className="kwd-panel block p-3">
            <span className="kwd-kpi-label">Verlauf suchen</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Lager, Öl, Fehler…"
              className={fieldCls}
            />
            {searchQuery && (
              <p className="text-kwd-muted mt-1 text-xs">
                {filteredTimeline.length} von {timeline.length} Einträgen
              </p>
            )}
          </label>
          <MachineLifecyclePanel
            machineId={machine.id}
            machineName={machine.name}
            timeline={filteredTimeline}
            isLoading={timelineLoading}
            hideHeaderActions={Boolean(searchQuery)}
          />
        </div>
      )}

      {tab === 'documents' && (
        <Suspense fallback={<LoadingFallback label="Unterlagen werden geladen…" />}>
          <MachineAttachmentsPanel
            machineId={machine.id}
            machineName={machine.name}
            onPlanQueued={() => setTab('plans')}
          />
        </Suspense>
      )}

      {tab === 'plans' && (
        <Suspense fallback={<LoadingFallback label="Pläne werden geladen…" />}>
          <MachinePlansPanel machineId={machine.id} machineName={machine.name} />
        </Suspense>
      )}

      {tab === 'knowledge' && (
        <Suspense fallback={<LoadingFallback label="Wissen wird geladen…" />}>
          <MachineKnowledgePanel
            machineId={machine.id}
            machineName={machine.name}
            barcode={machine.barcode}
            location={machine.location}
          />
        </Suspense>
      )}
    </>
  )

  if (fullscreen) {
    return (
      <div
        className="bg-kwd-bg fixed inset-0 z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${machine.name} – Vollbild`}
      >
        <header className="bg-kwd-surface border-kwd-border flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5 lg:px-4">
          <div className="min-w-0">
            <p className="text-kwd-muted text-[11px] font-semibold tracking-wide uppercase">
              Maschinenakte
            </p>
            <h2 className="truncate text-lg font-semibold tracking-tight">{machine.name}</h2>
            <p className="text-kwd-muted truncate font-mono text-xs">
              {machine.barcode}
              {machine.location ? ` · ${machine.location}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {onToggleFullscreen && (
              <button type="button" onClick={onToggleFullscreen} className="kwd-btn">
                Zur Liste
              </button>
            )}
            <button type="button" onClick={onClose} className="kwd-btn kwd-btn-primary">
              Schließen
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            className="bg-kwd-surface border-kwd-border flex w-[120px] shrink-0 flex-col gap-0.5 border-r p-2 sm:w-44 lg:w-52"
            aria-label="Bereiche"
            role="tablist"
          >
            {tabs.map(({ id, label }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={`kwd-nav-item ${active ? 'kwd-nav-item-active' : ''}`}
                >
                  {label}
                </button>
              )
            })}
          </nav>

          <div role="tabpanel" className="bg-kwd-bg min-h-0 min-w-0 flex-1 overflow-auto p-3 lg:p-4">
            {content}
          </div>
        </div>
      </div>
    )
  }

  // Kompakte Seitenansicht: nur Kurzinfo – volle Akte im Vollbild
  if (compact) {
    return (
      <section className="flex h-full min-h-0 flex-col" aria-label="Maschinen-Kurzinfo">
        <div className="kwd-toolbar shrink-0">
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-bold">{machine.name}</p>
            <p className="text-kwd-muted truncate font-mono text-xs">{machine.barcode}</p>
          </div>
          {onToggleFullscreen && (
            <button type="button" onClick={onToggleFullscreen} className="kwd-btn kwd-btn-primary">
              Vollbild-Akte
            </button>
          )}
          <button type="button" onClick={onClose} className="kwd-btn">
            Schließen
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          <MachineStammdatenForm
            machine={machine}
            compact
            healthLoading={healthLoading}
            uptimeDays={health?.uptimeDays ?? null}
            uptimeClass={uptimeHealthClass(
              health?.uptimeDays ?? null,
              health?.hasOpenTickets ?? false,
            )}
            healthHint={
              health?.hasOpenTickets
                ? `${health.openTicketCount} offen`
                : health?.lastResolvedAt
                  ? `Seit ${formatDate(health.lastResolvedAt)}`
                  : 'Kein Ticketabschluss'
            }
            maintenanceOverdue={Boolean(maintenanceOverdue)}
          />
          <p className="text-kwd-muted mt-3 px-1 text-xs">
            Unterlagen, Pläne, Verlauf & Störungen → Vollbild-Akte
            {machine.document_count > 0
              ? ` · ${machine.document_count} Doc${machine.document_count === 1 ? '' : 's'}`
              : ''}
            {machine.plan_label ? ` · ${machine.plan_label}` : ''}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Maschinen-Detail">
      <div className="kwd-toolbar shrink-0">
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-bold">{machine.name}</p>
          <p className="text-kwd-muted truncate font-mono text-xs">{machine.barcode}</p>
        </div>
        {onToggleFullscreen && (
          <button type="button" onClick={onToggleFullscreen} className="kwd-btn kwd-btn-primary">
            Vollbild
          </button>
        )}
        <button type="button" onClick={onClose} className="kwd-btn">
          Schließen
        </button>
      </div>

      <nav
        className="border-kwd-border bg-kwd-surface-light flex shrink-0 gap-0.5 overflow-x-auto border-b p-1"
        role="tablist"
      >
        {tabs.map(({ id, label, short }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`kwd-nav-item min-h-[36px] shrink-0 justify-center px-2 ${
                active ? 'kwd-nav-item-active' : ''
              }`}
            >
              <span className="lg:hidden">{short}</span>
              <span className="hidden lg:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-2">
        {content}
      </div>
    </section>
  )
}

function MachineStammdatenForm({
  machine,
  compact,
  healthLoading,
  uptimeDays,
  uptimeClass,
  healthHint,
  maintenanceOverdue,
}: {
  machine: MachineWithStats
  compact: boolean
  healthLoading: boolean
  uptimeDays: number | null
  uptimeClass: string
  healthHint: string
  maintenanceOverdue: boolean
}) {
  const updateMachine = useUpdateMachine()
  const [name, setName] = useState(machine.name)
  const [barcode, setBarcode] = useState(machine.barcode)
  const [location, setLocation] = useState(machine.location ?? '')
  const [status, setStatus] = useState<MachineStatus>(machine.status)
  const [warrantyUntil, setWarrantyUntil] = useState(toDateInput(machine.warranty_until))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(machine.name)
    setBarcode(machine.barcode)
    setLocation(machine.location ?? '')
    setStatus(machine.status)
    setWarrantyUntil(toDateInput(machine.warranty_until))
    setMessage(null)
    setError(null)
  }, [machine])

  const dirty =
    name.trim() !== machine.name ||
    normalizeBarcode(barcode) !== machine.barcode ||
    location.trim() !== (machine.location ?? '') ||
    status !== machine.status ||
    (warrantyUntil || '') !== toDateInput(machine.warranty_until)

  async function save() {
    setError(null)
    setMessage(null)
    if (!name.trim()) {
      setError('Bezeichnung ist Pflicht.')
      return
    }
    if (!location.trim()) {
      setError('Standort ist Pflicht.')
      return
    }
    try {
      await updateMachine.mutateAsync({
        id: machine.id,
        name: name.trim(),
        barcode: barcode.trim(),
        location: location.trim(),
        status,
        warranty_until: warrantyUntil || null,
      })
      setMessage('Gespeichert.')
    } catch (err) {
      setError(err instanceof Error ? formatSupabaseError(err) : 'Speichern fehlgeschlagen')
    }
  }

  const uptimeValue = healthLoading
    ? '…'
    : compact
      ? formatUptimeCompact(uptimeDays)
      : formatUptime(uptimeDays)

  const uptimeHint = compact
    ? uptimeDays === null
      ? 'Noch kein Vorfallabschluss'
      : healthHint
    : healthHint

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`grid gap-px bg-kwd-border ${
          compact ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-4'
        }`}
      >
        <StatTile
          label="Betriebszeit"
          value={uptimeValue}
          hint={uptimeHint}
          valueClass={uptimeClass}
          compact={compact}
        />
        <StatTile
          label="Nächste Wartung"
          value={formatDate(machine.next_maintenance_at)}
          hint={maintenanceOverdue ? 'Überfällig' : 'Geplant'}
          alert={maintenanceOverdue}
          compact={compact}
        />
        <StatTile
          label="Letzte Wartung"
          value={formatDate(machine.last_maintenance_at)}
          compact={compact}
        />
        <StatTile
          label="Letzte Reparatur"
          value={formatDate(machine.last_repair_at)}
          compact={compact}
        />
      </div>

      <form
        className="kwd-panel"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="kwd-panel-head">Stammdaten</div>
        <div className={`grid gap-3 p-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">
              Bezeichnung <span className="text-kwd-danger">*</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={fieldCls} />
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">
              Standort <span className="text-kwd-danger">*</span>
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Halle 1 / Verzahnung"
              required
              className={fieldCls}
            />
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">Scan-Code</span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(normalizeBarcode(e.target.value))}
              className={`${fieldCls} font-mono`}
            />
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MachineStatus)}
              className={fieldCls}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">Garantie bis</span>
            <input
              type="date"
              value={warrantyUntil}
              onChange={(e) => setWarrantyUntil(e.target.value)}
              className={fieldCls}
            />
          </label>

          {error && (
            <p className="text-kwd-danger bg-kwd-danger/10 border-kwd-danger border px-3 py-2 text-sm font-semibold sm:col-span-2">
              {error}
            </p>
          )}
          {message && (
            <p className="text-kwd-success bg-kwd-success/10 border-kwd-success/40 border px-3 py-2 text-sm font-semibold sm:col-span-2">
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={!dirty || updateMachine.isPending}
              className="kwd-btn kwd-btn-primary"
            >
              {updateMachine.isPending ? 'Speichern…' : 'Speichern'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setName(machine.name)
                  setBarcode(machine.barcode)
                  setLocation(machine.location ?? '')
                  setStatus(machine.status)
                  setWarrantyUntil(toDateInput(machine.warranty_until))
                  setError(null)
                  setMessage(null)
                }}
                className="kwd-btn"
              >
                Zurücksetzen
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  valueClass = '',
  alert = false,
  compact = false,
}: {
  label: string
  value: string
  hint?: string
  valueClass?: string
  alert?: boolean
  compact?: boolean
}) {
  return (
    <div className={`kwd-kpi min-w-0 ${compact ? '!p-2.5' : ''} ${alert ? 'bg-kwd-danger/10' : ''}`}>
      <p className="kwd-kpi-label truncate">{label}</p>
      <p
        className={`${compact ? 'mt-0.5 text-lg font-bold leading-tight' : 'kwd-kpi-value'} break-words ${valueClass}`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-kwd-muted mt-1 line-clamp-2 text-[11px] leading-snug">{hint}</p>
      )}
    </div>
  )
}
