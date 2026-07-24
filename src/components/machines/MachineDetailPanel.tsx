import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { formatUptime, formatUptimeCompact, uptimeHealthClass } from '../../lib/machineHealth'
import { normalizeBarcode } from '../../lib/barcode'
import { formatSupabaseError } from '../../lib/formatError'
import { machineCategorySuggestions } from '../../lib/machineCategories'
import { useMachineFieldOptions } from '../../lib/machineFieldOptions'
import { machineLocationSuggestions } from '../../lib/machineLocations'
import { maintenanceDueTone } from '../../lib/maintenanceDue'
import { useUpdateMachine } from '../../hooks/useMachines'
import { useQuickCompleteMaintenance } from '../../hooks/useQuickCompleteMaintenance'
import { useSetNextMaintenance } from '../../hooks/useSetNextMaintenance'
import {
  useMachinesWithStats,
  type MachineWithStats,
} from '../../hooks/useMachinesWithStats'
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
  { id: 'history', label: 'Lebenszyklus', short: 'Zykl.' },
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { data: health, isLoading: healthLoading } = useMachineHealth(machine.id)

  const filteredTimeline = useMemo(
    () => filterTimeline(timeline, searchQuery),
    [timeline, searchQuery],
  )

  const maintenanceTone = maintenanceDueTone(machine.next_maintenance_at)
  const maintenanceOverdue = maintenanceTone === 'overdue'
  const maintenanceSoon = maintenanceTone === 'soon'
  const repairTone = maintenanceDueTone(machine.next_repair_at)
  const repairOverdue = repairTone === 'overdue'
  const repairSoon = repairTone === 'soon'

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
    setMobileNavOpen(false)
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
          maintenanceSoon={Boolean(maintenanceSoon)}
          repairOverdue={Boolean(repairOverdue)}
          repairSoon={Boolean(repairSoon)}
          nextRepairAt={machine.next_repair_at}
        />
      )}

      {tab === 'problems' && (
        <MachineProblemPanel machineId={machine.id} machineName={machine.name} />
      )}

      {tab === 'history' && (
        <div className="flex flex-col gap-2">
          <label className="kwd-panel block p-3">
            <span className="kwd-kpi-label">Lebenszyklus suchen</span>
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
    const activeLabel = tabs.find((t) => t.id === tab)?.label ?? 'Bereich'
    return (
      <div
        className="bg-kwd-bg fixed inset-0 z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${machine.name} – Vollbild`}
      >
        <header className="bg-kwd-surface border-kwd-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5 lg:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="kwd-btn px-2.5 lg:hidden"
              aria-label="Menü öffnen"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              ☰
            </button>
            <div className="min-w-0">
              <p className="text-kwd-muted text-[11px] font-semibold tracking-wide uppercase">
                Maschinenakte · Lebenszyklus
              </p>
              <h2 className="truncate text-lg font-semibold tracking-tight">{machine.name}</h2>
              {machine.label_name?.trim() &&
                machine.label_name.trim().toLowerCase() !== machine.name.trim().toLowerCase() && (
                  <p className="text-kwd-muted truncate text-xs">
                    Menü/Zeichnung: {machine.label_name.trim()}
                  </p>
                )}
              <p className="text-kwd-muted truncate font-mono text-xs lg:hidden">
                {activeLabel}
                {machine.location ? ` · ${machine.location}` : ''}
              </p>
              <p className="text-kwd-muted hidden truncate font-mono text-xs lg:block">
                {machine.barcode}
                {machine.location ? ` · ${machine.location}` : ''}
              </p>
            </div>
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

        {/* Mobile hamburger drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Menü schließen"
              onClick={() => setMobileNavOpen(false)}
            />
            <nav
              className="bg-kwd-surface border-kwd-border absolute top-0 left-0 flex h-full w-[min(18rem,85vw)] flex-col gap-1 border-r p-3 shadow-xl"
              aria-label="Bereiche"
              role="tablist"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Bereiche</p>
                <button
                  type="button"
                  className="kwd-btn px-2"
                  onClick={() => setMobileNavOpen(false)}
                >
                  ✕
                </button>
              </div>
              {tabs.map(({ id, label }) => {
                const active = tab === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setTab(id)
                      setMobileNavOpen(false)
                    }}
                    className={`kwd-nav-item ${active ? 'kwd-nav-item-active' : ''}`}
                  >
                    {label}
                  </button>
                )
              })}
            </nav>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <nav
            className="bg-kwd-surface border-kwd-border hidden w-52 shrink-0 flex-col gap-0.5 border-r p-2 lg:flex"
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
            {machine.label_name?.trim() &&
              machine.label_name.trim().toLowerCase() !== machine.name.trim().toLowerCase() && (
                <p className="text-kwd-muted truncate text-xs">
                  Menü: {machine.label_name.trim()}
                </p>
              )}
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
            maintenanceSoon={Boolean(maintenanceSoon)}
            repairOverdue={Boolean(repairOverdue)}
            repairSoon={Boolean(repairSoon)}
            nextRepairAt={machine.next_repair_at}
          />
          <p className="text-kwd-muted mt-3 px-1 text-xs">
            Unterlagen, Pläne, Lebenszyklus & Störungen → Vollbild-Akte
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
          {machine.label_name?.trim() &&
            machine.label_name.trim().toLowerCase() !== machine.name.trim().toLowerCase() && (
              <p className="text-kwd-muted truncate text-xs">
                Menü: {machine.label_name.trim()}
              </p>
            )}
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
        className="border-kwd-border bg-kwd-surface-light grid shrink-0 gap-0.5 border-b p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
              title={label}
              onClick={() => setTab(id)}
              className={`kwd-nav-item min-h-[36px] min-w-0 justify-center px-1 text-[11px] sm:px-1.5 sm:text-xs ${
                active ? 'kwd-nav-item-active' : ''
              }`}
            >
              <span className="truncate">{short}</span>
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
  maintenanceSoon,
  repairOverdue,
  repairSoon,
  nextRepairAt,
}: {
  machine: MachineWithStats
  compact: boolean
  healthLoading: boolean
  uptimeDays: number | null
  uptimeClass: string
  healthHint: string
  maintenanceOverdue: boolean
  maintenanceSoon: boolean
  repairOverdue: boolean
  repairSoon: boolean
  nextRepairAt: string | null
}) {
  const updateMachine = useUpdateMachine()
  const setNextMaintenance = useSetNextMaintenance()
  const quickComplete = useQuickCompleteMaintenance()
  const { data: allMachines } = useMachinesWithStats()
  const { data: fieldOptions } = useMachineFieldOptions()
  const [name, setName] = useState(machine.name)
  const [labelName, setLabelName] = useState(machine.label_name ?? '')
  const [barcode, setBarcode] = useState(machine.barcode)
  const [location, setLocation] = useState(machine.location ?? '')
  const [category, setCategory] = useState(machine.category ?? '')
  const [status, setStatus] = useState<MachineStatus>(machine.status)
  const [warrantyUntil, setWarrantyUntil] = useState(toDateInput(machine.warranty_until))
  const [nextMaintenanceAt, setNextMaintenanceAt] = useState(
    toDateInput(machine.next_maintenance_at),
  )
  const [lastCuttingOil, setLastCuttingOil] = useState(toDateInput(machine.last_cutting_oil_at))
  const [nextCuttingOil, setNextCuttingOil] = useState(toDateInput(machine.next_cutting_oil_at))
  const [lastHydraulicOil, setLastHydraulicOil] = useState(
    toDateInput(machine.last_hydraulic_oil_at),
  )
  const [nextHydraulicOil, setNextHydraulicOil] = useState(
    toDateInput(machine.next_hydraulic_oil_at),
  )
  const [lastMaintCode, setLastMaintCode] = useState(machine.last_maintenance_code ?? '')
  const [nextMaintCode, setNextMaintCode] = useState(machine.next_maintenance_code ?? '')
  const [lastHydCode, setLastHydCode] = useState(machine.last_hydraulic_code ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)

  const categorySuggestions = useMemo(
    () =>
      machineCategorySuggestions([
        ...(fieldOptions?.categories ?? []),
        ...(allMachines ?? []).map((m) => m.category ?? ''),
        category,
      ]),
    [allMachines, category, fieldOptions?.categories],
  )

  const locationSuggestions = useMemo(
    () =>
      machineLocationSuggestions([
        ...(fieldOptions?.locations ?? []),
        ...(allMachines ?? []).map((m) => m.location ?? ''),
        location,
      ]),
    [allMachines, location, fieldOptions?.locations],
  )

  useEffect(() => {
    setName(machine.name)
    setLabelName(machine.label_name ?? '')
    setBarcode(machine.barcode)
    setLocation(machine.location ?? '')
    setCategory(machine.category ?? '')
    setStatus(machine.status)
    setWarrantyUntil(toDateInput(machine.warranty_until))
    setNextMaintenanceAt(toDateInput(machine.next_maintenance_at))
    setLastCuttingOil(toDateInput(machine.last_cutting_oil_at))
    setNextCuttingOil(toDateInput(machine.next_cutting_oil_at))
    setLastHydraulicOil(toDateInput(machine.last_hydraulic_oil_at))
    setNextHydraulicOil(toDateInput(machine.next_hydraulic_oil_at))
    setLastMaintCode(machine.last_maintenance_code ?? '')
    setNextMaintCode(machine.next_maintenance_code ?? '')
    setLastHydCode(machine.last_hydraulic_code ?? '')
    setMessage(null)
    setError(null)
  }, [machine])

  const dirty =
    name.trim() !== machine.name ||
    (labelName.trim() || '') !== (machine.label_name ?? '') ||
    normalizeBarcode(barcode) !== machine.barcode ||
    location.trim() !== (machine.location ?? '') ||
    (category.trim() || '') !== (machine.category ?? '') ||
    status !== machine.status ||
    (warrantyUntil || '') !== toDateInput(machine.warranty_until) ||
    (nextMaintenanceAt || '') !== toDateInput(machine.next_maintenance_at) ||
    (lastCuttingOil || '') !== toDateInput(machine.last_cutting_oil_at) ||
    (nextCuttingOil || '') !== toDateInput(machine.next_cutting_oil_at) ||
    (lastHydraulicOil || '') !== toDateInput(machine.last_hydraulic_oil_at) ||
    (nextHydraulicOil || '') !== toDateInput(machine.next_hydraulic_oil_at) ||
    (lastMaintCode.trim() || '') !== (machine.last_maintenance_code ?? '') ||
    (nextMaintCode.trim() || '') !== (machine.next_maintenance_code ?? '') ||
    (lastHydCode.trim() || '') !== (machine.last_hydraulic_code ?? '')

  const saving = updateMachine.isPending || setNextMaintenance.isPending

  async function save() {
    setError(null)
    setMessage(null)
    if (!name.trim()) {
      setError('Datenname (Bezeichnung) ist Pflicht.')
      return
    }
    if (!location.trim()) {
      setError('Standort ist Pflicht.')
      return
    }
    try {
      const nextMaintChanged =
        (nextMaintenanceAt || '') !== toDateInput(machine.next_maintenance_at)

      await updateMachine.mutateAsync({
        id: machine.id,
        name: name.trim(),
        label_name: labelName.trim() || null,
        barcode: barcode.trim(),
        location: location.trim(),
        category: category.trim() || null,
        status,
        warranty_until: warrantyUntil || null,
        last_cutting_oil_at: lastCuttingOil || null,
        next_cutting_oil_at: nextCuttingOil || null,
        last_hydraulic_oil_at: lastHydraulicOil || null,
        next_hydraulic_oil_at: nextHydraulicOil || null,
        last_maintenance_code: lastMaintCode.trim() || null,
        next_maintenance_code: nextMaintCode.trim() || null,
        last_hydraulic_code: lastHydCode.trim() || null,
      })

      if (nextMaintChanged) {
        await setNextMaintenance.mutateAsync({
          machineId: machine.id,
          nextDueDate: nextMaintenanceAt || null,
        })
      }

      setMessage('Gespeichert.')
    } catch (err) {
      setError(err instanceof Error ? formatSupabaseError(err) : 'Speichern fehlgeschlagen')
    }
  }

  async function completeMaintenanceNow() {
    if (
      !window.confirm(
        `Hauptuntersuchung für „${machine.name}“ jetzt als erledigt markieren?`,
      )
    ) {
      return
    }
    setCompleting(true)
    setError(null)
    setMessage(null)
    try {
      const result = await quickComplete.mutateAsync({ machineId: machine.id })
      setMessage(
        `HU erledigt · nächste: ${new Date(result.nextDueDate).toLocaleDateString('de-DE')}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Abschluss fehlgeschlagen')
    } finally {
      setCompleting(false)
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
          label="nächste geplante Wartung"
          value={formatDate(machine.next_maintenance_at)}
          hint={
            maintenanceOverdue
              ? 'Überfällig'
              : maintenanceSoon
                ? 'Innerhalb 3 Monate'
                : 'Geplant'
          }
          alert={maintenanceOverdue}
          warn={maintenanceSoon}
          compact={compact}
        />
        <StatTile
          label="nächste geplante Reparatur"
          value={formatDate(nextRepairAt)}
          hint={
            repairOverdue
              ? 'Überfällig'
              : repairSoon
                ? 'Innerhalb 3 Monate'
                : nextRepairAt
                  ? 'Geplant'
                  : 'Kein Termin'
          }
          alert={repairOverdue}
          warn={repairSoon}
          compact={compact}
        />
        <StatTile
          label="letzte Wartung"
          value={formatDate(machine.last_maintenance_at)}
          compact={compact}
        />
        <StatTile
          label="Letzte Reparatur"
          value={formatDate(machine.last_repair_at)}
          compact={compact}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={completing || quickComplete.isPending}
          onClick={() => void completeMaintenanceNow()}
          className="kwd-btn kwd-btn-primary min-h-[40px]"
          title="Hauptuntersuchung sofort abschließen"
        >
          {completing ? 'Speichern…' : 'HU erledigt'}
        </button>
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
              Datenname (Lebenszyklus) <span className="text-kwd-danger">*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={fieldCls}
              title="Wird beim Scan und im Lebenszyklus verwendet"
            />
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">Etikett / Zeichnung (Menü)</span>
            <input
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              className={fieldCls}
              placeholder="Optional – Name auf Plan/Etikett"
              title="Anzeigename aus Zeichnung oder öffentlichem Menü"
            />
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">
              Standort <span className="text-kwd-danger">*</span>
            </span>
            <input
              list="kwd-machine-location-stammdaten"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Halle 1 / Verzahnung"
              required
              className={fieldCls}
            />
            <datalist id="kwd-machine-location-stammdaten">
              {locationSuggestions.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">Kategorie</span>
            <input
              list="kwd-machine-category-stammdaten"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="eigene Kategorie…"
              className={fieldCls}
            />
            <p className="text-kwd-muted mt-1 text-[11px]">
              Wird als Ordner in der Liste geführt – einmal angelegt, später wieder wählbar.
            </p>
            <datalist id="kwd-machine-category-stammdaten">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">Maschinennummer</span>
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

          <div className="block min-w-0 sm:col-span-2">
            <span className="kwd-kpi-label">nächste geplante Wartung (HU)</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={nextMaintenanceAt}
                onChange={(e) => setNextMaintenanceAt(e.target.value)}
                className={`${fieldCls} mt-0 max-w-xs`}
              />
              <button
                type="button"
                disabled={!nextMaintenanceAt && !machine.next_maintenance_at}
                onClick={() => setNextMaintenanceAt('')}
                className="kwd-btn min-h-[40px]"
                title="Nächste geplante Wartung entfernen"
              >
                Entfernen
              </button>
            </div>
            <p className="text-kwd-muted mt-1 text-xs">
              Datum ändern oder leeren und speichern. Entfernen löscht den Termin aus der Liste.
            </p>
          </div>

          <label className="block min-w-0">
            <span className="kwd-kpi-label">letzter Schneidöl-Wechsel</span>
            <input
              type="date"
              value={lastCuttingOil}
              onChange={(e) => setLastCuttingOil(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">nächster Schneidöl-Wechsel</span>
            <input
              type="date"
              value={nextCuttingOil}
              onChange={(e) => setNextCuttingOil(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">letzter Hyd.-Ölwechsel</span>
            <input
              type="date"
              value={lastHydraulicOil}
              onChange={(e) => setLastHydraulicOil(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">nächster Hyd.-Ölwechsel</span>
            <input
              type="date"
              value={nextHydraulicOil}
              onChange={(e) => setNextHydraulicOil(e.target.value)}
              className={fieldCls}
            />
          </label>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">Wartung Code (E/I/IB)</span>
            <input
              value={lastMaintCode}
              onChange={(e) => setLastMaintCode(e.target.value)}
              placeholder="letzte"
              className={fieldCls}
            />
          </label>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">nächste Wartung Code</span>
            <input
              value={nextMaintCode}
              onChange={(e) => setNextMaintCode(e.target.value)}
              placeholder="E / I"
              className={fieldCls}
            />
          </label>
          <label className="block min-w-0">
            <span className="kwd-kpi-label">Hyd. Code (W/IB/K)</span>
            <input
              value={lastHydCode}
              onChange={(e) => setLastHydCode(e.target.value)}
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
              disabled={!dirty || saving}
              className="kwd-btn kwd-btn-primary"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setName(machine.name)
                  setLabelName(machine.label_name ?? '')
                  setBarcode(machine.barcode)
                  setLocation(machine.location ?? '')
                  setCategory(machine.category ?? '')
                  setStatus(machine.status)
                  setWarrantyUntil(toDateInput(machine.warranty_until))
                  setNextMaintenanceAt(toDateInput(machine.next_maintenance_at))
                  setLastCuttingOil(toDateInput(machine.last_cutting_oil_at))
                  setNextCuttingOil(toDateInput(machine.next_cutting_oil_at))
                  setLastHydraulicOil(toDateInput(machine.last_hydraulic_oil_at))
                  setNextHydraulicOil(toDateInput(machine.next_hydraulic_oil_at))
                  setLastMaintCode(machine.last_maintenance_code ?? '')
                  setNextMaintCode(machine.next_maintenance_code ?? '')
                  setLastHydCode(machine.last_hydraulic_code ?? '')
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
  warn = false,
  compact = false,
}: {
  label: string
  value: string
  hint?: string
  valueClass?: string
  alert?: boolean
  warn?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`kwd-kpi min-w-0 ${compact ? '!p-2.5' : ''} ${
        alert ? 'bg-kwd-danger/10' : warn ? 'bg-kwd-warning/10' : ''
      }`}
    >
      <p className="kwd-kpi-label truncate">{label}</p>
      <p
        className={`${compact ? 'mt-0.5 text-lg font-bold leading-tight' : 'kwd-kpi-value'} break-words ${
          alert ? 'text-kwd-danger' : warn ? 'text-kwd-warning' : valueClass
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-kwd-muted mt-1 line-clamp-2 text-[11px] leading-snug">{hint}</p>
      )}
    </div>
  )
}
