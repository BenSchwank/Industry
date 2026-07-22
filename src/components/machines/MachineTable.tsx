import { Fragment, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  copyToClipboard,
  machinesToTsv,
  mapPasteRowToMachine,
  parseExcelPaste,
  type ParsedMachinePaste,
} from '../../lib/excelClipboard'
import { normalizeBarcode, suggestMachineBarcode } from '../../lib/barcode'
import {
  MACHINE_CATEGORY_DATALIST_ID,
  UNCATEGORIZED_LABEL,
  groupMachinesByCategory,
  machineCategorySuggestions,
} from '../../lib/machineCategories'
import { useMachineFieldOptions } from '../../lib/machineFieldOptions'
import {
  MACHINE_LOCATION_DATALIST_ID,
  machineLocationSuggestions,
} from '../../lib/machineLocations'
import { printMachineLabels } from '../../lib/printLabels'
import { maintenanceDueClass, maintenanceDueTone } from '../../lib/maintenanceDue'
import {
  matchProblemSnippet,
  type MachineSortBy,
} from '../../hooks/useMachinesWithStats'
import { useBulkCreateMachines, useCreateMachine, useDeleteMachines, useDuplicateMachines, useUpdateMachine } from '../../hooks/useMachines'
import { useQuickCompleteMaintenance } from '../../hooks/useQuickCompleteMaintenance'
import type { MachineWithStats } from '../../hooks/useMachinesWithStats'
import type { MachineStatus } from '../../types/database'
import { Tip } from '../ui/Tip'
import { usePreferencesStore } from '../../stores/preferencesStore'
import { rememberMachineFieldOption, forgetMachineFieldOption, renameMachineFieldOption } from '../../lib/machineFieldOptions'
import { CategoryPickerButton } from './CategoryPickerButton'
import {
  draftToInput,
  EMPTY_DRAFT,
  MachineAddRow,
  validateDraft,
  type DraftField,
  type MachineAddRowHandle,
  type MachineDraftValues,
} from './MachineAddRow'

const STATUS_LABEL: Record<MachineStatus, string> = {
  active: 'Aktiv',
  maintenance: 'In Wartung',
  offline: 'Offline',
  decommissioned: 'Außer Betrieb',
}

const STATUS_CLS: Record<MachineStatus, string> = {
  active: 'bg-kwd-success/20 text-kwd-success',
  maintenance: 'bg-kwd-warning/20 text-kwd-warning',
  offline: 'bg-kwd-muted/20 text-kwd-muted',
  decommissioned: 'bg-kwd-danger/20 text-kwd-danger',
}

function formatDate(d: string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('de-DE')
}

function dateCellClass(d: string | null, forMaintenance = false) {
  if (!d) return ''
  if (forMaintenance) return maintenanceDueClass(d)
  if (new Date(d) < new Date()) return 'text-kwd-danger font-semibold'
  return ''
}

function isBlankDraft(d: MachineDraftValues) {
  return (
    !d.name.trim() &&
    !d.labelName.trim() &&
    !d.location.trim() &&
    !d.barcode.trim()
  )
}

function defaultDraftForCategory(groupKey: string): MachineDraftValues {
  return {
    ...EMPTY_DRAFT,
    category: groupKey === UNCATEGORIZED_LABEL ? '' : groupKey,
  }
}

interface MachineTableProps {
  machines: MachineWithStats[]
  selectedId: string | null
  showAddRow: boolean
  searchQuery?: string
  fillHeight?: boolean
  /** Bei false: Sortierung aus der Liste behalten (kein manuelles machineOrder) */
  useManualOrder?: boolean
  sortBy?: MachineSortBy
  sortDescending?: boolean
  onSortByChange?: (sortBy: MachineSortBy, descending: boolean) => void
  onSelect: (id: string) => void
  onOpenFullscreen?: (id: string) => void
  onAddCancel: () => void
  onAddSaved: (id: string) => void
  onOpenPlanPhoto?: () => void
}

function DocsCell({ machine: m }: { machine: MachineWithStats }) {
  if (m.document_count === 0) {
    return <span className="text-kwd-muted">–</span>
  }

  const planCls: Record<MachineWithStats['plan_status'], string> = {
    none: 'bg-kwd-surface-light text-kwd-muted',
    processing: 'bg-kwd-warning/20 text-kwd-warning',
    ready: 'bg-kwd-success/20 text-kwd-success',
    draft: 'bg-kwd-primary/15 text-kwd-primary',
    failed: 'bg-kwd-danger/15 text-kwd-danger',
    analyzed: 'bg-kwd-success/15 text-kwd-success',
  }

  const planShort: Record<MachineWithStats['plan_status'], string | null> = {
    none: null,
    processing: 'Analyse…',
    ready: 'Plan OK',
    draft: 'Entwurf',
    failed: 'Fehler',
    analyzed: 'Analysiert',
  }

  return (
    <div className="flex min-w-[7rem] flex-col gap-1">
      <span className="font-semibold tabular-nums">
        {m.document_count} Doc{m.document_count === 1 ? '' : 's'}
        {m.documents_analyzed > 0 && (
          <span className="text-kwd-muted font-normal"> · {m.documents_analyzed} ✓</span>
        )}
      </span>
      {planShort[m.plan_status] && (
        <span
          className={`inline-block max-w-[9rem] truncate px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${planCls[m.plan_status]}`}
          title={m.plan_label ?? undefined}
        >
          {planShort[m.plan_status]}
        </span>
      )}
    </div>
  )
}

function LocationCell({
  machine: m,
}: {
  machine: MachineWithStats
}) {
  const updateMachine = useUpdateMachine()
  const [value, setValue] = useState(m.location ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(m.location ?? '')
  }, [m.id, m.location])

  async function commit() {
    const next = value.trim()
    if (!next) {
      setValue(m.location ?? '')
      return
    }
    if (next === (m.location ?? '')) return
    setSaving(true)
    try {
      await updateMachine.mutateAsync({ id: m.id, location: next })
    } catch {
      setValue(m.location ?? '')
    } finally {
      setSaving(false)
    }
  }

  return (
    <td className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
      <input
        list={MACHINE_LOCATION_DATALIST_ID}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape') {
            setValue(m.location ?? '')
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder="Halle / Bereich…"
        disabled={saving}
        className="bg-transparent text-kwd-muted h-7 w-full min-w-[6rem] border-0 px-1 text-xs focus:bg-kwd-paper focus:outline focus:outline-1 focus:outline-[var(--kwd-primary)]"
        aria-label={`Standort für ${m.name}`}
        title="Freitext – bekannte Standorte erscheinen als Vorschlag"
      />
    </td>
  )
}

function SortableTh({
  label,
  column,
  sortBy,
  sortDescending,
  onSort,
  className = '',
}: {
  label: string
  column: Extract<MachineSortBy, 'name' | 'category' | 'location' | 'next_maintenance'>
  sortBy: MachineSortBy
  sortDescending: boolean
  onSort?: (
    column: Extract<MachineSortBy, 'name' | 'category' | 'location' | 'next_maintenance'>,
  ) => void
  className?: string
}) {
  const active = sortBy === column
  const marker = active ? (sortDescending ? ' ▼' : ' ▲') : ''
  if (!onSort) {
    return <th className={className}>{label}</th>
  }
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`hover:text-kwd-primary inline-flex items-center gap-0.5 font-semibold tracking-wide uppercase ${
          active ? 'text-kwd-primary' : ''
        }`}
        title={`${label} sortieren`}
      >
        {label}
        <span className="font-mono text-[10px] normal-case tracking-normal">{marker || ' ↕'}</span>
      </button>
    </th>
  )
}

function readDraggedMachineId(e: DragEvent, fallback: string | null): string | null {
  const fromData = e.dataTransfer.getData('text/plain')?.trim()
  return fromData || fallback
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  return Boolean(
    target &&
      (target as HTMLElement).closest?.(
        'input, button, select, textarea, a, label, [data-no-drag]',
      ),
  )
}

function MachineRow({
  machine: m,
  selected,
  checked,
  searchQuery,
  dragOver,
  completing,
  categorySuggestions,
  onSelect,
  onToggleCheck,
  onOpenFullscreen,
  onQuickComplete,
  onCategoryChange,
  onRenameCategory,
  onDeleteCategory,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  machine: MachineWithStats
  selected: boolean
  checked: boolean
  searchQuery?: string
  dragOver: boolean
  completing?: boolean
  categorySuggestions: string[]
  onSelect: (id: string) => void
  onToggleCheck: (id: string, shiftKey: boolean) => void
  onOpenFullscreen?: (id: string) => void
  onQuickComplete?: (machine: MachineWithStats) => void
  onCategoryChange: (machineId: string, category: string) => void
  onRenameCategory?: (from: string, to: string) => void | Promise<void>
  onDeleteCategory?: (category: string) => void | Promise<void>
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: (id: string, e: DragEvent) => void
  onDragEnd: () => void
}) {
  const problemHit = searchQuery ? matchProblemSnippet(m, searchQuery) : null
  const dueTone = maintenanceDueTone(m.next_maintenance_at)
  const showQuick =
    Boolean(onQuickComplete && m.next_maintenance_at) &&
    (dueTone === 'overdue' || dueTone === 'soon' || Boolean(m.next_maintenance_at))

  return (
    <tr
      draggable
      className={`cursor-pointer transition-colors ${
        dragOver
          ? 'bg-kwd-primary/25 outline outline-2 outline-[var(--kwd-primary)]'
          : checked || selected
            ? 'bg-kwd-primary/15'
            : 'hover:bg-kwd-surface-light'
      }`}
      onClick={() => onSelect(m.id)}
      onDoubleClick={() => {
        if (onOpenFullscreen) onOpenFullscreen(m.id)
        else onSelect(m.id)
      }}
      onDragStart={(e) => {
        if (isInteractiveDragTarget(e.target)) {
          e.preventDefault()
          return
        }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', m.id)
        onDragStart(m.id)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(m.id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop(m.id, e)
      }}
      onDragEnd={onDragEnd}
    >
      <td className="w-12 px-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={checked}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleCheck(m.id, e.shiftKey)
            }}
            className="accent-kwd-primary h-4 w-4 cursor-pointer"
            aria-label={`${m.name} markieren`}
            title="Markieren zum Verschieben zwischen Kategorien"
            readOnly
          />
          <span
            className="text-kwd-muted cursor-grab text-xs select-none active:cursor-grabbing"
            title="Auf anderen Ordner / Gerät ziehen = Kategorie wechseln"
            aria-hidden
          >
            ⋮⋮
          </span>
        </div>
      </td>
      <td className="font-mono text-xs font-semibold text-kwd-primary">{m.barcode}</td>
      <td className="font-medium">
        <div className="flex flex-col gap-0.5">
          <span title="Datenname (Lebenszyklus / Scan)">{m.name}</span>
          {m.label_name?.trim() &&
            m.label_name.trim().toLowerCase() !== m.name.trim().toLowerCase() && (
              <span
                className="text-kwd-muted text-[11px]"
                title="Etikett / Zeichnung (Menü)"
              >
                Menü: {m.label_name.trim()}
              </span>
            )}
          {m.open_ticket_count > 0 && (
            <span className="text-kwd-danger text-[11px] font-semibold">
              {m.open_ticket_count} offene Störung{m.open_ticket_count === 1 ? '' : 'en'}
            </span>
          )}
          {problemHit && (
            <span className="text-kwd-muted text-[11px]">Treffer: {problemHit}</span>
          )}
        </div>
      </td>
      <td className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
        <CategoryPickerButton
          value={m.category ?? ''}
          suggestions={categorySuggestions}
          buttonLabel={m.category?.trim() || 'Kat.'}
          title="Gerät in andere Kategorie verschieben"
          onChange={(c) => onCategoryChange(m.id, c)}
          onRename={onRenameCategory}
          onDelete={onDeleteCategory}
        />
      </td>
      <LocationCell machine={m} />
      <td>
        <span className={`inline-block px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[m.status]}`}>
          {STATUS_LABEL[m.status]}
        </span>
      </td>
      <td>
        <DocsCell machine={m} />
      </td>
      <td>{formatDate(m.last_maintenance_at)}</td>
      <td
        className={dateCellClass(m.next_maintenance_at, true)}
        title={
          dueTone === 'overdue'
            ? 'Überfällig'
            : dueTone === 'soon'
              ? 'Fällig innerhalb von 3 Monaten'
              : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <span>{formatDate(m.next_maintenance_at)}</span>
          {showQuick && (
            <button
              type="button"
              disabled={completing}
              onClick={() => onQuickComplete?.(m)}
              className="kwd-btn kwd-btn-primary px-1.5 py-0.5 text-[10px] font-bold"
              title="Hauptuntersuchung sofort als erledigt markieren"
            >
              {completing ? '…' : '✓'}
            </button>
          )}
        </div>
      </td>
      <td>{formatDate(m.last_repair_at)}</td>
      <td className={dateCellClass(m.warranty_until)}>
        {formatDate(m.warranty_until)}
      </td>
      <td className="text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (onOpenFullscreen) onOpenFullscreen(m.id)
            else onSelect(m.id)
          }}
          className="text-kwd-primary text-xs font-semibold hover:underline"
        >
          Vollbild
        </button>
      </td>
    </tr>
  )
}

export function MachineTable({
  machines,
  selectedId,
  showAddRow,
  searchQuery = '',
  fillHeight = false,
  useManualOrder = true,
  sortBy = 'manual',
  sortDescending = false,
  onSortByChange,
  onSelect,
  onOpenFullscreen,
  onAddSaved,
  onOpenPlanPhoto,
}: MachineTableProps) {
  const queryClient = useQueryClient()
  const categoryAddRowRefs = useRef<Map<string, MachineAddRowHandle>>(new Map())
  const tableFocusRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [bulkPending, setBulkPending] = useState<{
    count: number
    rows: ParsedMachinePaste[]
  } | null>(null)
  const machineOrder = usePreferencesStore((s) => s.machineOrder)
  const setMachineOrder = usePreferencesStore((s) => s.setMachineOrder)

  /** Eingabezeile pro Kategorie-Ordner */
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, MachineDraftValues>>({})
  const [selectedCategoryCell, setSelectedCategoryCell] = useState<{
    categoryKey: string
    field: DraftField
  } | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set())
  const [moreOpen, setMoreOpen] = useState(false)
  const [printingLabels, setPrintingLabels] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const bulkCreate = useBulkCreateMachines()
  const createMachine = useCreateMachine()
  const deleteMachines = useDeleteMachines()
  const duplicateMachines = useDuplicateMachines()
  const updateMachine = useUpdateMachine()
  const quickComplete = useQuickCompleteMaintenance()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [extraCategories, setExtraCategories] = useState<string[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const lastCheckedId = useRef<string | null>(null)

  function getCategoryDraft(groupKey: string): MachineDraftValues {
    return categoryDrafts[groupKey] ?? defaultDraftForCategory(groupKey)
  }

  function updateCategoryDraft(groupKey: string, values: MachineDraftValues) {
    setCategoryDrafts((prev) => ({ ...prev, [groupKey]: values }))
  }

  function resetCategoryDraft(groupKey: string) {
    setCategoryDrafts((prev) => {
      const next = { ...prev }
      delete next[groupKey]
      return next
    })
  }

  function resetAllCategoryDrafts() {
    setCategoryDrafts({})
    setSelectedCategoryCell(null)
  }

  const orderedMachines = useMemo(() => {
    if (!useManualOrder || machineOrder.length === 0) return machines
    const map = new Map(machines.map((m) => [m.id, m]))
    const sorted: MachineWithStats[] = []
    for (const id of machineOrder) {
      const m = map.get(id)
      if (m) {
        sorted.push(m)
        map.delete(id)
      }
    }
    for (const m of map.values()) sorted.push(m)
    return sorted
  }, [machines, machineOrder, useManualOrder])

  function handleHeaderSort(
    column: Extract<MachineSortBy, 'name' | 'category' | 'location' | 'next_maintenance'>,
  ) {
    if (!onSortByChange) return
    if (sortBy === column) {
      if (!sortDescending) onSortByChange(column, true)
      else onSortByChange('manual', false)
    } else {
      onSortByChange(column, false)
    }
  }

  const categoryDraftValues = useMemo(
    () => Object.values(categoryDrafts),
    [categoryDrafts],
  )

  const { data: fieldOptions } = useMachineFieldOptions()

  const categorySuggestions = useMemo(
    () =>
      machineCategorySuggestions([
        ...extraCategories,
        ...(fieldOptions?.categories ?? []),
        ...machines.map((m) => m.category ?? ''),
        ...categoryDraftValues.map((d) => d.category),
      ]),
    [machines, categoryDraftValues, fieldOptions?.categories, extraCategories],
  )

  const locationSuggestions = useMemo(
    () =>
      machineLocationSuggestions([
        ...(fieldOptions?.locations ?? []),
        ...machines.map((m) => m.location ?? ''),
        ...categoryDraftValues.map((d) => d.location),
      ]),
    [machines, categoryDraftValues, fieldOptions?.locations],
  )

  const categoryGroups = useMemo(
    () =>
      groupMachinesByCategory(orderedMachines, {
        sortGroups: sortBy === 'manual' ? false : true,
        descending: sortBy === 'category' ? sortDescending : false,
        ensureCategories: categorySuggestions,
      }),
    [orderedMachines, sortBy, sortDescending, categorySuggestions],
  )

  function toggleCategoryCollapsed(key: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleQuickComplete(m: MachineWithStats) {
    if (
      !window.confirm(
        `Hauptuntersuchung für „${m.name}“ jetzt als erledigt markieren?\n\nNächste Fälligkeit wird aus dem Intervall berechnet.`,
      )
    ) {
      return
    }
    setCompletingId(m.id)
    try {
      const result = await quickComplete.mutateAsync({ machineId: m.id })
      flash(
        `HU erledigt · nächste: ${new Date(result.nextDueDate).toLocaleDateString('de-DE')}`,
      )
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Abschluss fehlgeschlagen')
    } finally {
      setCompletingId(null)
    }
  }

  async function rememberCategory(value: string) {
    const v = value.trim()
    if (!v) return
    setExtraCategories((prev) =>
      prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v],
    )
    await rememberMachineFieldOption('category', v)
    void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
  }

  async function renameCategory(from: string, to: string) {
    const next = to.trim()
    if (!next) return
    const targets = orderedMachines.filter(
      (m) => (m.category ?? '').trim().toLowerCase() === from.trim().toLowerCase(),
    )
    await Promise.all(
      targets.map((m) => updateMachine.mutateAsync({ id: m.id, category: next })),
    )
    setExtraCategories((prev) => {
      const without = prev.filter((x) => x.toLowerCase() !== from.trim().toLowerCase())
      if (!without.some((x) => x.toLowerCase() === next.toLowerCase())) without.push(next)
      return without
    })
    await renameMachineFieldOption('category', from, next)
    void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
    flash(
      targets.length > 0
        ? `„${from}“ → „${next}“ (${targets.length})`
        : `Kategorie „${next}“`,
    )
  }

  async function deleteCategory(category: string) {
    const label = category.trim()
    if (!label || label === UNCATEGORIZED_LABEL) return
    const targets = orderedMachines.filter(
      (m) => (m.category ?? '').trim().toLowerCase() === label.toLowerCase(),
    )
    if (
      !window.confirm(
        `Kategorie „${label}“ löschen?\n\n${
          targets.length > 0
            ? `${targets.length} Gerät(e) landen unter „${UNCATEGORIZED_LABEL}“.`
            : `Der leere Ordner wird entfernt.`
        }`,
      )
    ) {
      return
    }
    await Promise.all(
      targets.map((m) => updateMachine.mutateAsync({ id: m.id, category: null })),
    )
    setExtraCategories((prev) =>
      prev.filter((x) => x.toLowerCase() !== label.toLowerCase()),
    )
    await forgetMachineFieldOption('category', label)
    void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    void queryClient.invalidateQueries({ queryKey: ['machines-with-stats'] })
    flash(
      targets.length > 0
        ? `„${label}“ gelöscht · ${targets.length} → ${UNCATEGORIZED_LABEL}`
        : `„${label}“ gelöscht`,
    )
  }

  async function moveMachinesToCategory(categoryKey: string, sourceId?: string) {
    const movingIds =
      sourceId && checkedIds.has(sourceId) && checkedIds.size > 0
        ? orderedMachines.filter((m) => checkedIds.has(m.id)).map((m) => m.id)
        : sourceId
          ? [sourceId]
          : checkedList.map((m) => m.id)

    if (movingIds.length === 0) {
      flash('Zuerst Geräte markieren (Häkchen) oder per ⋮⋮ ziehen')
      return
    }

    const nextCategory = categoryKey === UNCATEGORIZED_LABEL ? null : categoryKey

    try {
      await Promise.all(
        movingIds.map((id) => {
          const m = orderedMachines.find((x) => x.id === id)
          if (!m) return Promise.resolve()
          if ((m.category?.trim() || null) === nextCategory) return Promise.resolve()
          return updateMachine.mutateAsync({ id, category: nextCategory })
        }),
      )
      if (nextCategory) await rememberCategory(nextCategory)
      flash(
        movingIds.length === 1
          ? `Kategorie → ${nextCategory ?? UNCATEGORIZED_LABEL}`
          : `${movingIds.length} → ${nextCategory ?? UNCATEGORIZED_LABEL}`,
      )
      setCheckedIds(new Set())
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Kategorie konnte nicht gesetzt werden')
    }
  }

  const flatIds = useMemo(() => orderedMachines.map((m) => m.id), [orderedMachines])
  const allChecked =
    orderedMachines.length > 0 && orderedMachines.every((m) => checkedIds.has(m.id))
  const checkedList = useMemo(
    () => orderedMachines.filter((m) => checkedIds.has(m.id)),
    [orderedMachines, checkedIds],
  )
  const filledDrafts = useMemo(
    () =>
      categoryGroups
        .map((g) => ({
          groupKey: g.key,
          draft: getCategoryDraft(g.key),
        }))
        .filter(({ draft }) => !isBlankDraft(draft)),
    [categoryGroups, categoryDrafts],
  )

  useEffect(() => {
    if (!showAddRow) {
      resetAllCategoryDrafts()
      setDraftError(null)
    }
  }, [showAddRow])

  useEffect(() => {
    const idSet = new Set(machines.map((m) => m.id))
    const pruned = machineOrder.filter((id) => idSet.has(id))
    const known = new Set(pruned)
    const missing = machines.map((m) => m.id).filter((id) => !known.has(id))
    if (missing.length === 0 && pruned.length === machineOrder.length) return
    setMachineOrder([...pruned, ...missing])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines])

  useEffect(() => {
    setCheckedIds((prev) => {
      const next = new Set([...prev].filter((id) => flatIds.includes(id)))
      return next.size === prev.size ? prev : next
    })
  }, [flatIds])

  useEffect(() => {
    if (!moreOpen) return
    function onDoc(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3000)
  }

  function beginDrag(id: string) {
    dragIdRef.current = id
    setDragId(id)
    if (!checkedIds.has(id)) setCheckedIds(new Set([id]))
  }

  function finishDrag() {
    dragIdRef.current = null
    setDragId(null)
    setDragOverId(null)
    setDragOverCategory(null)
  }

  function scheduleFinishDrag() {
    window.setTimeout(() => finishDrag(), 0)
  }

  function handleCategoryDrop(e: DragEvent, categoryKey: string) {
    e.preventDefault()
    e.stopPropagation()
    const sourceId = readDraggedMachineId(e, dragIdRef.current)
    if (sourceId) void moveMachinesToCategory(categoryKey, sourceId)
    else if (checkedList.length > 0) void moveMachinesToCategory(categoryKey)
    finishDrag()
  }

  function handleCategoryDragOver(e: DragEvent, categoryKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCategory(categoryKey)
  }

  function handleCategoryDragLeave(e: DragEvent, categoryKey: string) {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDragOverCategory((cur) => (cur === categoryKey ? null : cur))
  }

  async function moveMachinesOnto(targetId: string, sourceId: string) {
    const movingIds =
      checkedIds.has(sourceId) && checkedIds.size > 0
        ? orderedMachines.filter((m) => checkedIds.has(m.id)).map((m) => m.id)
        : [sourceId]

    if (movingIds.includes(targetId)) return

    const target = orderedMachines.find((m) => m.id === targetId)
    if (!target) return

    const targetCat = target.category?.trim() || UNCATEGORIZED_LABEL
    const needsCategoryMove = movingIds.some((id) => {
      const m = orderedMachines.find((x) => x.id === id)
      const cat = m?.category?.trim() || UNCATEGORIZED_LABEL
      return cat !== targetCat
    })

    // Anderer Ordner → Kategorie wechseln (nicht Standort/Reihenfolge)
    if (needsCategoryMove) {
      await moveMachinesToCategory(targetCat, sourceId)
      return
    }

    const remaining = flatIds.filter((id) => !movingIds.includes(id))
    const targetIdx = remaining.indexOf(targetId)
    const nextOrder = [
      ...remaining.slice(0, targetIdx + 1),
      ...movingIds,
      ...remaining.slice(targetIdx + 1),
    ]
    setMachineOrder(nextOrder)

    const newLocation = target.location?.trim() || ''
    try {
      await Promise.all(
        movingIds.map((id) => {
          const m = orderedMachines.find((x) => x.id === id)
          if (!m || (m.location ?? '') === newLocation) return Promise.resolve()
          return updateMachine.mutateAsync({ id, location: newLocation })
        }),
      )
      flash(
        movingIds.length === 1
          ? newLocation
            ? `Standort → ${newLocation}`
            : 'Reihenfolge geändert'
          : `${movingIds.length} verschoben` + (newLocation ? ` · Standort → ${newLocation}` : ''),
      )
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Standort-Update fehlgeschlagen')
    }
  }

  async function setMachineCategory(machineId: string, category: string) {
    const next = category.trim() || null
    try {
      await updateMachine.mutateAsync({ id: machineId, category: next })
      if (next) await rememberCategory(next)
      flash(next ? `Kategorie → ${next}` : `Kategorie → ${UNCATEGORIZED_LABEL}`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Kategorie fehlgeschlagen')
    }
  }

  async function handlePrintLabels() {
    setMoreOpen(false)
    const rows = checkedList.length > 0 ? checkedList : orderedMachines
    if (rows.length === 0) {
      flash('Keine Maschinen zum Drucken')
      return
    }
    const missing = rows.filter((m) => !normalizeBarcode(m.barcode))
    if (missing.length > 0) {
      flash(`${missing.length} Maschine(n) ohne Scan-Code – bitte zuerst Code setzen`)
      return
    }
    setPrintingLabels(true)
    try {
      await printMachineLabels(
        rows.map((m) => ({
          code: m.barcode,
          title: m.name,
          subtitle: m.location || undefined,
        })),
      )
      flash(`${rows.length} Label${rows.length === 1 ? '' : 's'} auf einem Blatt`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Label-Druck fehlgeschlagen')
    } finally {
      setPrintingLabels(false)
    }
  }

  function toggleCheck(id: string, shiftKey: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastCheckedId.current) {
        const a = flatIds.indexOf(lastCheckedId.current)
        const b = flatIds.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to; i++) next.add(flatIds[i])
          lastCheckedId.current = id
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      lastCheckedId.current = id
      return next
    })
  }

  function toggleCheckAll() {
    if (allChecked) setCheckedIds(new Set())
    else setCheckedIds(new Set(flatIds))
  }

  async function handleCopySelection() {
    const rows = checkedList.length > 0 ? checkedList : orderedMachines
    const tsv = machinesToTsv(rows)
    const ok = await copyToClipboard(tsv)
    flash(ok ? `${rows.length} Zeile(n) kopiert` : 'Kopieren fehlgeschlagen')
  }

  async function handleDuplicateSelection() {
    if (checkedList.length === 0) {
      flash('Bitte zuerst Zeilen markieren')
      return
    }
    const { results, errors } = await duplicateMachines.mutateAsync(checkedList)
    setCheckedIds(new Set())
    flash(`${results.length} dupliziert` + (errors.length ? ` · ${errors.length} Fehler` : ''))
  }

  async function handleDeleteSelection() {
    if (checkedList.length === 0) {
      flash('Bitte zuerst Zeilen markieren')
      return
    }
    if (
      !confirm(
        `${checkedList.length} Maschine(n) endgültig löschen? Zugehörige Daten können verloren gehen.`,
      )
    ) {
      return
    }
    try {
      await deleteMachines.mutateAsync(checkedList.map((m) => m.id))
      setCheckedIds(new Set())
      flash(`${checkedList.length} gelöscht`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Löschen fehlgeschlagen')
    }
  }

  function handleFillDown(_categoryKey: string, _field: DraftField, _rowCount: number) {
    // Pro Ordner nur eine Eingabezeile – kein Fill-Down über mehrere Zeilen
  }

  async function saveCategoryDraft(groupKey: string) {
    setDraftError(null)
    const draft = getCategoryDraft(groupKey)
    if (isBlankDraft(draft)) return

    const withCategory: MachineDraftValues = {
      ...draft,
      category: groupKey === UNCATEGORIZED_LABEL ? draft.category.trim() : groupKey,
    }

    const err = validateDraft(withCategory)
    if (err) {
      setDraftError(err)
      return
    }

    try {
      const machine = await createMachine.mutateAsync(draftToInput(withCategory))
      resetCategoryDraft(groupKey)
      if (withCategory.category.trim()) await rememberCategory(withCategory.category.trim())
      onAddSaved(machine.id)
      flash(
        groupKey === UNCATEGORIZED_LABEL
          ? 'Maschine gespeichert'
          : `Gespeichert in „${groupKey}"`,
      )
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    }
  }

  async function saveDrafts() {
    setDraftError(null)
    if (filledDrafts.length === 0) {
      setDraftError('Mindestens Bezeichnung und Standort in einer Ordner-Zeile eingeben')
      return
    }

    const rows = filledDrafts.map(({ groupKey, draft }) => ({
      groupKey,
      input: draftToInput({
        ...draft,
        category: groupKey === UNCATEGORIZED_LABEL ? draft.category.trim() : groupKey,
      }),
    }))

    for (const { draft, groupKey } of filledDrafts) {
      const err = validateDraft({
        ...draft,
        category: groupKey === UNCATEGORIZED_LABEL ? draft.category.trim() : groupKey,
      })
      if (err) {
        setDraftError(err)
        return
      }
    }

    if (filledDrafts.length === 1) {
      await saveCategoryDraft(filledDrafts[0].groupKey)
      return
    }

    const { results, errors } = await bulkCreate.mutateAsync(rows.map((r) => r.input))
    if (results.length > 0) {
      resetAllCategoryDrafts()
      onAddSaved(results[results.length - 1].id)
    }
    flash(
      `${results.length} Maschinen gespeichert` +
        (errors.length ? ` · ${errors.length} Fehler` : ''),
    )
    if (errors.length && results.length === 0) {
      setDraftError(errors[0] ?? 'Speichern fehlgeschlagen')
    }
  }

  async function handleCopyAll() {
    await handleCopySelection()
  }

  function applyPasteText(text: string) {
    if (!text.includes('\t') && !text.includes('\n')) return false
    const parsed = parseExcelPaste(text)
    if (parsed.length === 0) return false
    const mapped = parsed
      .map(mapPasteRowToMachine)
      .filter((r): r is NonNullable<typeof r> => r !== null)
    if (mapped.length === 0) {
      flash('Keine gültigen Excel-Zeilen erkannt')
      return true
    }
    if (mapped.length === 1) {
      const targetKey =
        selectedCategoryCell?.categoryKey ??
        categoryGroups.find((g) => isBlankDraft(getCategoryDraft(g.key)))?.key ??
        categoryGroups[0]?.key ??
        UNCATEGORIZED_LABEL
      const handle = categoryAddRowRefs.current.get(targetKey)
      handle?.fillFromPaste(parsed[0])
      const mappedRow = mapPasteRowToMachine(parsed[0])
      if (mappedRow) {
        updateCategoryDraft(targetKey, {
          ...defaultDraftForCategory(targetKey),
          name: mappedRow.name,
          labelName: '',
          category:
            targetKey === UNCATEGORIZED_LABEL
              ? mappedRow.category ?? ''
              : targetKey,
          location: mappedRow.location ?? '',
          barcode: mappedRow.barcode
            ? normalizeBarcode(mappedRow.barcode)
            : suggestMachineBarcode(mappedRow.name),
          status: (mappedRow.status as MachineStatus) ?? 'active',
          lastMaintenance: mappedRow.last_maintenance_at ?? '',
          nextMaintenance: mappedRow.next_maintenance_at ?? '',
          lastRepair: mappedRow.last_repair_at ?? '',
          warrantyUntil: mappedRow.warranty_until ?? '',
        })
      }
      flash(`1 Zeile in „${targetKey === UNCATEGORIZED_LABEL ? UNCATEGORIZED_LABEL : targetKey}" – Enter speichert`)
      return true
    }
    void importBulk(mapped)
    return true
  }

  async function importBulk(rows: ParsedMachinePaste[]) {
    const inputs = rows
      .filter((row) => row.name.trim() && row.location?.trim())
      .map((row) => {
        const barcode = row.barcode
          ? normalizeBarcode(row.barcode)
          : suggestMachineBarcode(row.name)
        return {
          barcode,
          name: row.name,
          category: row.category?.trim() || null,
          location: row.location!.trim(),
          warranty_until: row.warranty_until ?? null,
          status: (row.status as MachineStatus) ?? 'active',
          last_maintenance_at: row.last_maintenance_at ?? null,
          next_maintenance_at: row.next_maintenance_at ?? null,
          last_repair_at: row.last_repair_at ?? null,
        }
      })
    const skipped = rows.length - inputs.length
    if (inputs.length === 0) {
      flash('Import abgebrochen – Bezeichnung und Standort sind Pflicht')
      return
    }
    setBulkPending({ count: inputs.length, rows })
    const { results, errors } = await bulkCreate.mutateAsync(inputs)
    setBulkPending(null)
    flash(
      `${results.length} aus Excel übernommen` +
        (skipped ? ` · ${skipped} übersprungen` : '') +
        (errors.length ? ` · ${errors.length} Fehler` : ''),
    )
    if (results.length > 0) onAddSaved(results[results.length - 1].id)
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData.getData('text/plain')
    if (applyPasteText(text)) e.preventDefault()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement | null
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (mod && e.key.toLowerCase() === 'c' && !inField) {
        e.preventDefault()
        void handleCopyAll()
      }
      if (mod && e.key.toLowerCase() === 'v' && !inField) {
        tableFocusRef.current?.focus()
      }
      if (mod && e.key.toLowerCase() === 's' && showAddRow) {
        e.preventDefault()
        void saveDrafts()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, showAddRow, filledDrafts])

  return (
    <div className="flex flex-col gap-2">
      <div className="kwd-toolbar justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-kwd-muted text-xs font-semibold tracking-wide uppercase">
            Bearbeiten
          </span>
          <button
            type="button"
            onClick={() => void handleCopySelection()}
            disabled={machines.length === 0 || bulkCreate.isPending}
            className="kwd-btn"
          >
            Kopieren
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicateSelection()}
            disabled={checkedList.length === 0 || duplicateMachines.isPending}
            className="kwd-btn"
          >
            Duplizieren{checkedList.length > 0 ? ` (${checkedList.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteSelection()}
            disabled={checkedList.length === 0 || deleteMachines.isPending}
            className="kwd-btn kwd-btn-danger"
          >
            Löschen{checkedList.length > 0 ? ` (${checkedList.length})` : ''}
          </button>
          <span className="bg-kwd-border mx-1 hidden h-5 w-px sm:inline" aria-hidden />
          <CategoryPickerButton
            value=""
            suggestions={categorySuggestions}
            buttonLabel={
              checkedList.length > 0 ? `Kategorie (${checkedList.length})` : 'Kategorie'
            }
            title="Kategorien verwalten: zuweisen, anlegen, umbenennen, löschen"
            onRename={(from, to) => renameCategory(from, to)}
            onDelete={(cat) => deleteCategory(cat)}
            onChange={(c) => {
              const next = c.trim()
              if (checkedList.length > 0) {
                void (async () => {
                  try {
                    await Promise.all(
                      checkedList.map((m) =>
                        updateMachine.mutateAsync({
                          id: m.id,
                          category: next || null,
                        }),
                      ),
                    )
                    if (next) await rememberCategory(next)
                    flash(
                      next
                        ? `${checkedList.length} → ${next}`
                        : `${checkedList.length} → ${UNCATEGORIZED_LABEL}`,
                    )
                  } catch (e) {
                    flash(e instanceof Error ? e.message : 'Kategorie fehlgeschlagen')
                  }
                })()
              } else if (next) {
                void rememberCategory(next).then(() => {
                  flash(`Ordner „${next}“ angelegt – unten in der Kategorie anlegen`)
                })
              }
            }}
          />
          <span className="bg-kwd-border mx-1 hidden h-5 w-px sm:inline" aria-hidden />
          {onOpenPlanPhoto && (
            <button
              type="button"
              onClick={onOpenPlanPhoto}
              disabled={bulkCreate.isPending}
              className="kwd-btn kwd-btn-primary sm:hidden"
              title="Hallenplan mit dem Handy fotografieren"
            >
              📷 Plan fotografieren
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (!applyPasteText(text)) flash('Zwischenablage enthält keine Excel-Daten')
              } catch {
                flash('Bitte Strg+V in der Tabelle verwenden')
                tableFocusRef.current?.focus()
              }
            }}
            disabled={bulkCreate.isPending}
            className="kwd-btn kwd-btn-primary"
          >
            Einfügen
          </button>
          {filledDrafts.length > 0 && (
            <button
              type="button"
              onClick={() => void saveDrafts()}
              disabled={createMachine.isPending || bulkCreate.isPending}
              className="kwd-btn kwd-btn-primary"
            >
              Speichern ({filledDrafts.length})
            </button>
          )}
          {checkedList.length > 0 && (
            <button type="button" onClick={() => setCheckedIds(new Set())} className="kwd-btn">
              Auswahl aufheben
            </button>
          )}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="kwd-btn px-2"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="Weitere Aktionen"
            >
              ⋮
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="border-kwd-border bg-kwd-surface absolute top-full right-0 z-30 mt-1 min-w-[14rem] border py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handlePrintLabels()}
                  disabled={printingLabels || orderedMachines.length === 0}
                  className="hover:bg-kwd-surface-light disabled:text-kwd-muted w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed"
                >
                  {printingLabels
                    ? 'Labels werden vorbereitet…'
                    : checkedList.length > 0
                      ? `Labels drucken (${checkedList.length})`
                      : `Alle Labels drucken (${orderedMachines.length})`}
                </button>
                <p className="text-kwd-muted border-kwd-border border-t px-3 py-2 text-[11px] leading-snug">
                  Markierte Maschinen → mehrere Labels auf einem A4-Blatt
                </p>
              </div>
            )}
          </div>
        </div>
        <Tip>
          <p className="text-kwd-muted text-xs">
            <strong className="text-kwd-text">📷 Plan fotografieren</strong> (oben orange): Liste aus
            Foto erkennen · Jeder Ordner hat unten eine Eingabezeile · Verschieben: Häkchen + „hierher“
            oder ⋮⋮ ziehen
          </p>
        </Tip>
      </div>

      {bulkCreate.isPending && (
        <p className="bg-kwd-primary/10 text-kwd-text border-kwd-primary border px-3 py-2 text-sm font-medium">
          Excel-Import: {bulkPending?.count ?? '…'} Zeilen werden übernommen…
        </p>
      )}
      {toast && (
        <p className="bg-kwd-success/15 text-kwd-success border-kwd-success/30 border px-3 py-2 text-xs font-medium">
          {toast}
        </p>
      )}
      {draftError && (
        <p className="bg-kwd-danger/10 text-kwd-danger border-kwd-danger border px-3 py-2 text-xs font-medium">
          {draftError}
        </p>
      )}

      <div
        ref={tableFocusRef}
        tabIndex={0}
        className={`border-kwd-border border focus:outline focus:outline-2 focus:outline-[color-mix(in_srgb,var(--kwd-primary)_40%,transparent)] ${
          fillHeight ? 'min-h-[70vh]' : 'max-h-[calc(100vh-280px)] min-h-[320px] overflow-auto'
        } ${dragId ? 'kwd-drag-active' : ''}`}
        onDragOver={(e) => {
          if (!dragIdRef.current) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onPaste={handlePaste}
      >
        <datalist id={MACHINE_CATEGORY_DATALIST_ID}>
          {categorySuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id={MACHINE_LOCATION_DATALIST_ID}>
          {locationSuggestions.map((loc) => (
            <option key={loc} value={loc} />
          ))}
        </datalist>
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-kwd-surface sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="w-10 px-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleCheckAll}
                  className="accent-kwd-primary h-4 w-4"
                  aria-label="Alle markieren"
                />
              </th>
              <th>Scan-Code</th>
              <SortableTh
                label="Bezeichnung"
                column="name"
                sortBy={sortBy}
                sortDescending={sortDescending}
                onSort={onSortByChange ? handleHeaderSort : undefined}
                className="min-w-[160px]"
              />
              <SortableTh
                label="Kategorie"
                column="category"
                sortBy={sortBy}
                sortDescending={sortDescending}
                onSort={onSortByChange ? handleHeaderSort : undefined}
                className="min-w-[7rem]"
              />
              <SortableTh
                label="Standort"
                column="location"
                sortBy={sortBy}
                sortDescending={sortDescending}
                onSort={onSortByChange ? handleHeaderSort : undefined}
              />
              <th>Status</th>
              <th className="min-w-[100px]">Docs / Plan</th>
              <th>Letzte HU</th>
              <SortableTh
                label="Nächste HU"
                column="next_maintenance"
                sortBy={sortBy}
                sortDescending={sortDescending}
                onSort={onSortByChange ? handleHeaderSort : undefined}
              />
              <th>Letzte Reparatur</th>
              <th>Garantie</th>
              <th className="w-24"> </th>
            </tr>
          </thead>
          <tbody>
            {categoryGroups.map((group) => {
              const collapsed = collapsedCategories.has(group.key)
              const dropActive = dragOverCategory === group.key && dragId != null
              return (
                <Fragment key={group.key}>
                  <tr
                    className={`border-kwd-border border-y ${
                      dropActive
                        ? 'bg-kwd-primary/25 outline outline-2 outline-[var(--kwd-primary)]'
                        : 'bg-kwd-surface/90'
                    }`}
                  >
                    <td
                      colSpan={12}
                      className="px-2 py-1.5"
                      onDragOver={(e) => handleCategoryDragOver(e, group.key)}
                      onDragLeave={(e) => handleCategoryDragLeave(e, group.key)}
                      onDrop={(e) => handleCategoryDrop(e, group.key)}
                    >
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCategoryCollapsed(group.key)}
                          className="hover:text-kwd-primary flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-bold tracking-wide uppercase"
                          title="Ordner ein-/ausklappen · Maschinen hierher ziehen setzt die Kategorie"
                        >
                          <span className="font-mono text-[11px]" aria-hidden>
                            {collapsed ? '▶' : '▼'}
                          </span>
                          <span className="truncate">{group.label}</span>
                          <span className="text-kwd-muted font-mono font-normal normal-case tracking-normal">
                            {group.machines.length}
                          </span>
                        </button>
                        {checkedList.length > 0 && (
                          <button
                            type="button"
                            onClick={() => void moveMachinesToCategory(group.key)}
                            className="kwd-btn kwd-btn-primary shrink-0 px-2 text-xs"
                            title="Markierte Geräte in diesen Ordner verschieben"
                          >
                            {checkedList.length} hierher
                          </button>
                        )}
                        <CategoryPickerButton
                          value={group.key === UNCATEGORIZED_LABEL ? '' : group.key}
                          suggestions={categorySuggestions}
                          buttonLabel="Umbenennen"
                          title="Ordner umbenennen oder Maschinen umsortieren"
                          onRename={(from, to) => renameCategory(from, to)}
                          onDelete={(cat) => deleteCategory(cat)}
                          onChange={(c) => {
                            void (async () => {
                              const next = c.trim() || null
                              try {
                                await Promise.all(
                                  group.machines.map((m) =>
                                    updateMachine.mutateAsync({ id: m.id, category: next }),
                                  ),
                                )
                                if (next) await rememberCategory(next)
                                flash(
                                  next
                                    ? `Ordner → ${next}`
                                    : `Ordner → ${UNCATEGORIZED_LABEL}`,
                                )
                              } catch (e) {
                                flash(
                                  e instanceof Error ? e.message : 'Kategorie fehlgeschlagen',
                                )
                              }
                            })()
                          }}
                        />
                        {group.key !== UNCATEGORIZED_LABEL && (
                          <button
                            type="button"
                            onClick={() => void deleteCategory(group.key)}
                            className="text-kwd-danger hover:bg-kwd-danger/10 shrink-0 px-2 py-1 text-xs font-semibold"
                            title={`Ordner „${group.label}“ löschen – Geräte landen unter „${UNCATEGORIZED_LABEL}“`}
                          >
                            Löschen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {!collapsed && (
                    <>
                      {group.machines.map((m) => (
                        <MachineRow
                          key={m.id}
                          machine={m}
                          selected={m.id === selectedId}
                          checked={checkedIds.has(m.id)}
                          searchQuery={searchQuery}
                          dragOver={dragOverId === m.id && dragId !== m.id}
                          completing={completingId === m.id}
                          categorySuggestions={categorySuggestions}
                          onSelect={onSelect}
                          onToggleCheck={toggleCheck}
                          onOpenFullscreen={onOpenFullscreen}
                          onQuickComplete={(machine) => void handleQuickComplete(machine)}
                          onCategoryChange={(id, c) => void setMachineCategory(id, c)}
                          onRenameCategory={(from, to) => renameCategory(from, to)}
                          onDeleteCategory={(cat) => deleteCategory(cat)}
                          onDragStart={(id) => beginDrag(id)}
                          onDragOver={(id) => setDragOverId(id)}
                          onDrop={(id, e) => {
                            const sourceId = readDraggedMachineId(e, dragIdRef.current)
                            if (sourceId) void moveMachinesOnto(id, sourceId)
                            finishDrag()
                          }}
                          onDragEnd={scheduleFinishDrag}
                        />
                      ))}
                      {group.machines.length === 0 && (
                        <tr
                          className={dropActive ? 'bg-kwd-primary/15' : 'bg-kwd-paper/40'}
                          onDragOver={(e) => handleCategoryDragOver(e, group.key)}
                          onDragLeave={(e) => handleCategoryDragLeave(e, group.key)}
                          onDrop={(e) => handleCategoryDrop(e, group.key)}
                        >
                          <td colSpan={12} className="text-kwd-muted px-4 py-1 text-[11px]">
                            {dropActive
                              ? 'Loslassen → in diesen Ordner'
                              : 'Leer – Geräte ziehen oder unten direkt anlegen'}
                          </td>
                        </tr>
                      )}
                      {showAddRow && (
                        <MachineAddRow
                          key={`add-${group.key}`}
                          values={getCategoryDraft(group.key)}
                          blank
                          fixedCategory={
                            group.key === UNCATEGORIZED_LABEL ? '' : group.key
                          }
                          fixedCategoryLabel={group.label}
                          categorySuggestions={categorySuggestions}
                          onRenameCategory={(from, to) => renameCategory(from, to)}
                          onDeleteCategory={(cat) => deleteCategory(cat)}
                          onCategoryPicked={(c) => {
                            void rememberCategory(c)
                          }}
                          selectedField={
                            selectedCategoryCell?.categoryKey === group.key
                              ? selectedCategoryCell.field
                              : null
                          }
                          onSelectField={(field) =>
                            setSelectedCategoryCell({ categoryKey: group.key, field })
                          }
                          onChange={(v) =>
                            updateCategoryDraft(group.key, {
                              ...v,
                              category:
                                group.key === UNCATEGORIZED_LABEL ? v.category : group.key,
                            })
                          }
                          onFillDown={(field, n) => handleFillDown(group.key, field, n)}
                          onSaveRequest={() => void saveCategoryDraft(group.key)}
                          onCancel={() => resetCategoryDraft(group.key)}
                          registerRef={(h) => {
                            if (h) categoryAddRowRefs.current.set(group.key, h)
                            else categoryAddRowRefs.current.delete(group.key)
                          }}
                          error={null}
                          saving={createMachine.isPending || bulkCreate.isPending}
                        />
                      )}
                    </>
                  )}
                </Fragment>
              )
            })}
            {orderedMachines.length === 0 && !showAddRow && (
              <tr>
                <td colSpan={12} className="text-kwd-muted px-4 py-12 text-center">
                  Keine Treffer – Suche ändern oder Strg+V aus Excel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
