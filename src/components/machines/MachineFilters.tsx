import { machineCategorySuggestions } from '../../lib/machineCategories'
import { machineLocationSuggestions } from '../../lib/machineLocations'
import type {
  MachineDateFilter,
  MachineSortBy,
} from '../../hooks/useMachinesWithStats'

interface MachineFiltersProps {
  filter: MachineDateFilter
  onFilterChange: (f: MachineDateFilter) => void
  searchQuery: string
  onSearchChange: (v: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  category: string
  onCategoryChange: (v: string) => void
  location: string
  onLocationChange: (v: string) => void
  sortBy: MachineSortBy
  onSortByChange: (v: MachineSortBy) => void
  categoryOptions: string[]
  locationOptions: string[]
  resultCount: number
  totalCount: number
  /** Nur Schnellfilter-Pills (Suche/Datum sitzen in der Kopfzeile) */
  pillsOnly?: boolean
}

const QUICK_FILTERS: { value: MachineDateFilter; label: string; short: string }[] = [
  { value: 'all', label: 'Alle', short: 'Alle' },
  { value: 'open_problems', label: 'Offene Störungen', short: 'Störungen' },
  { value: 'maintenance_overdue', label: 'Wartung überfällig', short: 'Überfällig' },
  { value: 'maintenance_due_soon', label: 'Wartung ≤ 7 Tage', short: '≤7 Tage' },
  { value: 'warranty_expired', label: 'Garantie abgelaufen', short: 'Garantie' },
  { value: 'repair_recent', label: 'Reparatur (30 Tage)', short: 'Reparatur' },
]

const SORT_OPTIONS: { value: MachineSortBy; label: string }[] = [
  { value: 'manual', label: 'Manuell' },
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Kategorie' },
  { value: 'location', label: 'Standort' },
  { value: 'next_maintenance', label: 'Nächste Wartung' },
]

const filterInputCls =
  'border-kwd-border bg-kwd-paper min-h-[32px] max-w-[10rem] border px-1.5 text-xs'

export function MachineFilters({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  category,
  onCategoryChange,
  location,
  onLocationChange,
  sortBy,
  onSortByChange,
  categoryOptions,
  locationOptions,
  resultCount,
  totalCount,
  pillsOnly = false,
}: MachineFiltersProps) {
  const categories = machineCategorySuggestions(categoryOptions)
  const locations = machineLocationSuggestions(locationOptions)

  const hasActive = Boolean(
    dateFrom ||
      dateTo ||
      searchQuery ||
      category ||
      location ||
      sortBy !== 'manual' ||
      filter !== 'all',
  )

  function resetAll() {
    onDateFromChange('')
    onDateToChange('')
    onSearchChange('')
    onCategoryChange('')
    onLocationChange('')
    onSortByChange('manual')
    onFilterChange('all')
  }

  const categoryFilter = (
    <>
      <input
        list="kwd-filter-category"
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        placeholder="Kategorie: alle"
        className={filterInputCls}
        aria-label="Kategorie filtern"
        title="Kategorie wählen oder eintippen"
      />
      <datalist id="kwd-filter-category">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  )

  const locationFilter = (
    <>
      <input
        list="kwd-filter-location"
        value={location}
        onChange={(e) => onLocationChange(e.target.value)}
        placeholder="Standort: alle"
        className={filterInputCls}
        aria-label="Standort filtern"
        title="Standort wählen oder eintippen"
      />
      <datalist id="kwd-filter-location">
        {locations.map((loc) => (
          <option key={loc} value={loc} />
        ))}
      </datalist>
    </>
  )

  const sortSelect = (
    <select
      value={sortBy}
      onChange={(e) => onSortByChange(e.target.value as MachineSortBy)}
      className="border-kwd-border bg-kwd-paper min-h-[32px] border px-1.5 text-xs"
      aria-label="Sortierung"
      title="Sortieren"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          Sort: {o.label}
        </option>
      ))}
    </select>
  )

  if (pillsOnly) {
    return (
      <div className="border-kwd-border flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
        {QUICK_FILTERS.map(({ value, label, short }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => onFilterChange(value)}
            className={`kwd-btn px-2 py-1 text-[11px] ${filter === value ? 'kwd-btn-primary' : ''}`}
          >
            <span className="lg:hidden">{short}</span>
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
        {categoryFilter}
        {locationFilter}
        {sortSelect}
        {hasActive && (
          <button type="button" onClick={resetAll} className="kwd-btn ml-auto px-2 text-xs">
            Filter zurücksetzen
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="border-kwd-border flex shrink-0 flex-col gap-1.5 border-b px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Suchen…"
          className="border-kwd-border bg-kwd-paper min-h-[32px] min-w-[10rem] flex-1 border px-2 text-sm sm:max-w-xs"
          autoComplete="off"
          aria-label="Maschinen suchen"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            onDateFromChange(e.target.value)
            onFilterChange('all')
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
            onDateToChange(e.target.value)
            onFilterChange('all')
          }}
          className="border-kwd-border bg-kwd-paper min-h-[32px] border px-1.5 text-xs"
          title="Datum bis"
          aria-label="Datum bis"
        />
        {categoryFilter}
        {locationFilter}
        {sortSelect}
        <span className="text-kwd-muted ml-auto font-mono text-xs tabular-nums">
          {resultCount}/{totalCount}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK_FILTERS.map(({ value, label, short }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => onFilterChange(value)}
            className={`kwd-btn px-2 py-1 text-[11px] ${filter === value ? 'kwd-btn-primary' : ''}`}
          >
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
