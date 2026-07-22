import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { QS1ImportModal } from '../components/import/QS1ImportModal'
import { PlanPhotoImportModal } from '../components/machines/PlanPhotoImportModal'
import { MachineDetailPanel } from '../components/machines/MachineDetailPanel'
import { MachineFilters } from '../components/machines/MachineFilters'
import { MachineTable } from '../components/machines/MachineTable'
import { useMachineTimeline } from '../hooks/useMachineLifecycle'
import {
  filterMachines,
  sortMachines,
  uniqueMachineCategories,
  uniqueMachineLocations,
  useMachinesWithStats,
  type MachineDateFilter,
  type MachineSortBy,
} from '../hooks/useMachinesWithStats'
import { machineCategorySuggestions, DEFAULT_MACHINE_CATEGORIES } from '../lib/machineCategories'
import { useMachineFieldOptions, seedWartungsplanCategories } from '../lib/machineFieldOptions'
import { useQueryClient } from '@tanstack/react-query'
import { machineLocationSuggestions } from '../lib/machineLocations'
import { useIsDesktop } from '../hooks/usePlatform'
import { useAppStore } from '../stores/appStore'
import { usePreferencesStore } from '../stores/preferencesStore'

export default function MachinesPage() {
  const selectedId = useAppStore((s) => s.selectedMachineId)
  const setSelectedMachineId = useAppStore((s) => s.setSelectedMachineId)
  const machineDetailFocus = useAppStore((s) => s.machineDetailFocus)
  const setMachineDetailFocus = useAppStore((s) => s.setMachineDetailFocus)
  const [showAddRow, setShowAddRow] = useState(true)
  const [filter, setFilter] = useState<MachineDateFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [sortBy, setSortBy] = useState<MachineSortBy>('manual')
  const [sortDescending, setSortDescending] = useState(false)
  const [detailFullscreen, setDetailFullscreen] = useState(false)
  const [showQs1Import, setShowQs1Import] = useState(false)
  const [showPlanPhotoImport, setShowPlanPhotoImport] = useState(false)
  const isDesktop = useIsDesktop()
  const showTips = usePreferencesStore((s) => s.showTips)
  const tableZoom = usePreferencesStore((s) => s.tableZoom)
  const setTableZoom = usePreferencesStore((s) => s.setTableZoom)
  const canvasRef = useRef<HTMLDivElement>(null)

  const { data: machines, isLoading } = useMachinesWithStats()
  const { data: fieldOptions } = useMachineFieldOptions()
  const { data: timeline, isLoading: timelineLoading } = useMachineTimeline(selectedId)
  const queryClient = useQueryClient()

  const categoryOptions = useMemo(
    () =>
      machineCategorySuggestions([
        ...DEFAULT_MACHINE_CATEGORIES,
        ...(fieldOptions?.categories ?? []),
        ...uniqueMachineCategories(machines ?? []),
      ]),
    [machines, fieldOptions?.categories],
  )
  const locationOptions = useMemo(
    () =>
      machineLocationSuggestions([
        ...(fieldOptions?.locations ?? []),
        ...uniqueMachineLocations(machines ?? []),
      ]),
    [machines, fieldOptions?.locations],
  )

  // Wartungsplan-Ordner: anlegen + gleiche Namen überschreiben; eigene Ordner / App-Seiten bleiben
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await seedWartungsplanCategories()
      if (!cancelled) {
        void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
        void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [queryClient])

  const filtered = useMemo(() => {
    const list = filterMachines(machines ?? [], {
      filter,
      customFrom: dateFrom || undefined,
      customTo: dateTo || undefined,
      searchQuery,
      category: categoryFilter || undefined,
      location: locationFilter || undefined,
    })
    return sortMachines(list, sortBy, sortDescending)
  }, [
    machines,
    filter,
    dateFrom,
    dateTo,
    searchQuery,
    categoryFilter,
    locationFilter,
    sortBy,
    sortDescending,
  ])

  const selected = machines?.find((m) => m.id === selectedId)
  const drawerOpen = Boolean(selected && !detailFullscreen)

  useEffect(() => {
    if (selected && machineDetailFocus) {
      // Am PC: Seitenpanel – Tabelle bleibt sichtbar (Fotos/Lebenszyklus neben der Liste)
      // Am Handy: Vollbild-Akte
      setDetailFullscreen(!isDesktop)
      setMachineDetailFocus(false)
    }
  }, [selected, machineDetailFocus, setMachineDetailFocus, isDesktop])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      const current = usePreferencesStore.getState().tableZoom
      setTableZoom(current + delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setTableZoom])

  if (isLoading) {
    return <p className="text-kwd-muted p-4 lg:p-6">Lade Maschinen…</p>
  }

  function closeDetail() {
    setSelectedMachineId(null)
    setDetailFullscreen(false)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showQs1Import && <QS1ImportModal onClose={() => setShowQs1Import(false)} />}
      {showPlanPhotoImport && (
        <PlanPhotoImportModal
          categorySuggestions={categoryOptions}
          onClose={() => setShowPlanPhotoImport(false)}
        />
      )}

      {/* Tabellen-Canvas – volle Viewport-Höhe, alle Maschinen scrollbar */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="kwd-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-t-0 lg:mx-2 lg:mt-2 lg:rounded lg:border">
          <div className="kwd-toolbar shrink-0 flex-wrap gap-2">
            <strong className="text-sm tracking-wide uppercase">Maschinen</strong>

            <button
              type="button"
              onClick={() => setShowPlanPhotoImport(true)}
              className="kwd-btn kwd-btn-primary order-2 min-h-[40px] w-full sm:order-none sm:w-auto"
              title="Hallenplan oder Anlagenliste fotografieren – KI liest Maschinen aus"
            >
              📷 Plan fotografieren
            </button>

            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen…"
              className="border-kwd-border bg-kwd-paper order-last min-h-[32px] w-full min-w-[8rem] flex-1 border px-2 text-sm sm:order-none sm:w-auto sm:max-w-[14rem]"
              autoComplete="off"
              aria-label="Maschinen suchen"
            />

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setFilter('all')
              }}
              className="border-kwd-border bg-kwd-paper min-h-[32px] border px-1.5 text-xs"
              title="Datum von"
              aria-label="Datum von"
            />
            <span className="text-kwd-muted text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setFilter('all')
              }}
              className="border-kwd-border bg-kwd-paper min-h-[32px] border px-1.5 text-xs"
              title="Datum bis"
              aria-label="Datum bis"
            />

            <span className="text-kwd-muted font-mono text-xs tabular-nums">
              {filtered.length}/{machines?.length ?? 0}
            </span>

            <div className="ml-auto flex flex-wrap items-center gap-1">
              <button
                type="button"
                className="kwd-btn px-2"
                title="Herauszoomen"
                onClick={() => setTableZoom(tableZoom - 0.1)}
              >
                −
              </button>
              <span className="text-kwd-muted min-w-[2.75rem] text-center font-mono text-xs">
                {Math.round(tableZoom * 100)}%
              </span>
              <button
                type="button"
                className="kwd-btn px-2"
                title="Hineinzoomen"
                onClick={() => setTableZoom(tableZoom + 0.1)}
              >
                +
              </button>
              <button
                type="button"
                className="kwd-btn px-2"
                title="100 %"
                onClick={() => setTableZoom(1)}
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => setShowPlanPhotoImport(true)}
                className="kwd-btn hidden sm:inline-flex"
                title="Hallenplan fotografieren und Maschinen erkennen"
              >
                Plan-Foto
              </button>
              <button type="button" onClick={() => setShowQs1Import(true)} className="kwd-btn hidden sm:inline-flex">
                QS1
              </button>
            </div>
          </div>

          <MachineFilters
            filter={filter}
            onFilterChange={setFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            category={categoryFilter}
            onCategoryChange={setCategoryFilter}
            location={locationFilter}
            onLocationChange={setLocationFilter}
            sortBy={sortBy}
            onSortByChange={(next) => {
              setSortBy(next)
              setSortDescending(false)
            }}
            categoryOptions={categoryOptions}
            locationOptions={locationOptions}
            resultCount={filtered.length}
            totalCount={machines?.length ?? 0}
            pillsOnly
          />

          {showTips && (
            <p className="text-kwd-muted border-kwd-border border-b px-3 py-1 text-[11px]">
              📷 <strong>Plan fotografieren</strong> (orange) · Häkchen →{' '}
              <strong>Kategorie zuweisen</strong> · <strong>Kategorie hinzufügen</strong> →
              Ordner anlegen · unten in jedem Ordner Maschinen eintragen
            </p>
          )}
          <div
            ref={canvasRef}
            className="min-h-0 flex-1 overflow-auto"
            style={{
              paddingRight: drawerOpen && isDesktop ? 8 : 0,
            }}
          >
            <div
              className="origin-top-left pb-24"
              style={{ zoom: tableZoom } as CSSProperties}
            >
              <MachineTable
                machines={filtered}
                selectedId={selectedId}
                showAddRow={showAddRow}
                searchQuery={searchQuery}
                fillHeight
                useManualOrder={sortBy === 'manual'}
                sortBy={sortBy}
                sortDescending={sortDescending}
                onSortByChange={(next, descending) => {
                  setSortBy(next)
                  setSortDescending(descending)
                }}
                onSelect={(id) => {
                  setSelectedMachineId(id)
                  setDetailFullscreen(false)
                }}
                onOpenFullscreen={(id) => {
                  setSelectedMachineId(id)
                  setDetailFullscreen(true)
                }}
                onAddCancel={() => setShowAddRow(true)}
                onAddSaved={() => {
                  setShowAddRow(true)
                }}
                onOpenPlanPhoto={() => setShowPlanPhotoImport(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Detail-Drawer: überlagert, quetscht die Tabelle nicht */}
      {drawerOpen && selected && (
        <>
          <button
            type="button"
            aria-label="Detail schließen"
            className="bg-kwd-text/20 fixed inset-0 z-30 lg:hidden"
            onClick={closeDetail}
          />
          <aside
            className="border-kwd-border bg-kwd-bg fixed inset-y-0 right-0 z-40 flex w-full max-w-full flex-col border-l shadow-xl sm:max-w-md lg:max-w-lg xl:max-w-xl"
            aria-label="Maschinenakte"
          >
            <MachineDetailPanel
              machine={selected}
              timeline={timeline ?? []}
              timelineLoading={timelineLoading}
              isDesktop={isDesktop}
              compact={false}
              fullscreen={false}
              onToggleFullscreen={() => setDetailFullscreen(true)}
              onClose={closeDetail}
            />
          </aside>
        </>
      )}

      {detailFullscreen && selected && (
        <MachineDetailPanel
          machine={selected}
          timeline={timeline ?? []}
          timelineLoading={timelineLoading}
          isDesktop={isDesktop}
          compact={false}
          fullscreen
          onToggleFullscreen={() => setDetailFullscreen(false)}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}
