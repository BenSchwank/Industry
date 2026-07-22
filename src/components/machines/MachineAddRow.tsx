import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  normalizeBarcode,
  suggestMachineBarcode,
  validateBarcode,
} from '../../lib/barcode'
import { mapPasteRowToMachine } from '../../lib/excelClipboard'
import { MACHINE_LOCATION_DATALIST_ID } from '../../lib/machineLocations'
import type { MachineStatus } from '../../types/database'
import { CategoryPickerButton } from './CategoryPickerButton'
import { ExcelFillCell } from './ExcelFillCell'

const STATUS_OPTIONS: { value: MachineStatus; label: string }[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'maintenance', label: 'In Wartung' },
  { value: 'offline', label: 'Offline' },
  { value: 'decommissioned', label: 'Außer Betrieb' },
]

const inputCls =
  'bg-transparent h-8 w-full min-w-0 border-0 px-2 text-sm focus:outline-none'

function dateInputCls(value: string) {
  return `${inputCls} text-xs text-kwd-muted${value ? '' : ' kwd-date-blank'}`
}

export type DraftField =
  | 'barcode'
  | 'name'
  | 'labelName'
  | 'category'
  | 'location'
  | 'status'
  | 'lastMaintenance'
  | 'nextMaintenance'
  | 'lastRepair'
  | 'warrantyUntil'

export interface MachineDraftValues {
  barcode: string
  name: string
  /** Anzeigename Zeichnung / Menü */
  labelName: string
  category: string
  location: string
  status: MachineStatus
  lastMaintenance: string
  nextMaintenance: string
  lastRepair: string
  warrantyUntil: string
}

export interface MachineAddRowHandle {
  fillFromPaste: (cells: string[]) => void
  focusFirst: () => void
  getValues: () => MachineDraftValues
}

interface MachineAddRowProps {
  values?: MachineDraftValues
  /** Leere Canvas-Zeile (kein orangener Rahmen) */
  blank?: boolean
  selectedField: DraftField | null
  onSelectField: (field: DraftField) => void
  onChange: (values: MachineDraftValues) => void
  onFillDown: (field: DraftField, rowCount: number) => void
  onSaveRequest: () => void
  onCancel: () => void
  registerRef?: (handle: MachineAddRowHandle | null) => void
  error?: string | null
  saving?: boolean
  categorySuggestions?: string[]
  onRenameCategory?: (from: string, to: string) => void | Promise<void>
  onDeleteCategory?: (category: string) => void | Promise<void>
  onCategoryPicked?: (category: string) => void
  /** Ordner-Zeile: Kategorie ist fest (z. B. am Ende jedes Ordners) */
  fixedCategory?: string
  fixedCategoryLabel?: string
}

export const EMPTY_DRAFT: MachineDraftValues = {
  barcode: '',
  name: '',
  labelName: '',
  category: '',
  location: '',
  status: 'active',
  lastMaintenance: '',
  nextMaintenance: '',
  lastRepair: '',
  warrantyUntil: '',
}

export function MachineAddRow({
  values: controlled,
  blank: _blank = false,
  selectedField,
  onSelectField,
  onChange,
  onFillDown,
  onSaveRequest,
  onCancel,
  registerRef,
  error,
  saving,
  categorySuggestions = [],
  onRenameCategory,
  onDeleteCategory,
  onCategoryPicked,
  fixedCategory,
  fixedCategoryLabel,
}: MachineAddRowProps) {
  const [local, setLocal] = useState<MachineDraftValues>(controlled ?? EMPTY_DRAFT)
  const values = controlled ?? local
  const nameRef = useRef<HTMLInputElement>(null)
  const barcodeManual = useRef(false)

  function setValues(next: MachineDraftValues) {
    if (!controlled) setLocal(next)
    onChange(next)
  }

  function patch(field: DraftField, value: string) {
    if (field === 'barcode') {
      barcodeManual.current = true
      setValues({ ...values, barcode: normalizeBarcode(value) })
      return
    }
    if (field === 'name') {
      const next: MachineDraftValues = { ...values, name: value }
      if (!barcodeManual.current) {
        next.barcode = value.trim() ? suggestMachineBarcode(value) : ''
      }
      setValues(next)
      return
    }
    if (field === 'labelName') {
      setValues({ ...values, labelName: value })
      return
    }
    setValues({ ...values, [field]: value })
  }

  function suggestCode(fromName?: string) {
    barcodeManual.current = false
    const code = suggestMachineBarcode((fromName ?? values.name) || 'MASCHINE')
    setValues({ ...values, barcode: code })
  }

  function fillFromPaste(cells: string[]) {
    const mapped = mapPasteRowToMachine(cells)
    if (!mapped) return
    barcodeManual.current = Boolean(mapped.barcode)
    const next: MachineDraftValues = {
      ...values,
      name: mapped.name,
      labelName: '',
      category: mapped.category ?? '',
      location: mapped.location ?? '',
      barcode: mapped.barcode
        ? normalizeBarcode(mapped.barcode)
        : suggestMachineBarcode(mapped.name),
      status:
        mapped.status && STATUS_OPTIONS.some((o) => o.value === mapped.status)
          ? (mapped.status as MachineStatus)
          : 'active',
      lastMaintenance: mapped.last_maintenance_at ?? '',
      nextMaintenance: mapped.next_maintenance_at ?? '',
      lastRepair: mapped.last_repair_at ?? '',
      warrantyUntil: mapped.warranty_until ?? '',
    }
    setValues(next)
  }

  useEffect(() => {
    registerRef?.({
      fillFromPaste,
      focusFirst: () => nameRef.current?.focus(),
      getValues: () => values,
    })
    return () => registerRef?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerRef, values])

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSaveRequest()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  function cell(field: DraftField, child: ReactNode) {
    return (
      <ExcelFillCell
        selected={selectedField === field}
        onSelect={() => onSelectField(field)}
        onFillDown={(n) => onFillDown(field, n)}
      >
        {child}
      </ExcelFillCell>
    )
  }

  const hasContent = Boolean(
    values.name.trim() || values.location.trim() || values.barcode.trim(),
  )

  return (
    <>
    <tr
      className={`border-kwd-border h-9 border-b ${
        hasContent ? 'bg-kwd-primary/10' : 'bg-kwd-paper/40 hover:bg-kwd-surface-light'
      }`}
      onKeyDown={handleKeyDown}
    >
      <td className="w-12 px-1" />
      <td className="px-1 py-0.5">
        {cell(
          'barcode',
          <div className="flex min-w-[7rem] gap-1">
            <input
              value={values.barcode}
              onChange={(e) => patch('barcode', e.target.value)}
              onFocus={() => onSelectField('barcode')}
              placeholder="Scan-Code"
              className={`${inputCls} font-mono text-xs`}
            />
            <button
              type="button"
              onClick={() => suggestCode()}
              title="Code aus Name"
              className="bg-kwd-surface-light text-kwd-muted shrink-0 px-1 text-xs"
            >
              ↻
            </button>
          </div>,
        )}
      </td>
      <td className="px-1 py-0.5">
        {cell(
          'name',
          <input
            ref={nameRef}
            value={values.name}
            onChange={(e) => patch('name', e.target.value)}
            onFocus={() => onSelectField('name')}
            placeholder="Bezeichnung"
            title="Maschinenname"
            className={inputCls}
          />,
        )}
      </td>
      <td className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
        {fixedCategory !== undefined ? (
          <span
            className="text-kwd-muted block truncate px-1 text-xs font-semibold"
            title={fixedCategoryLabel ?? (fixedCategory || 'Ohne Kategorie')}
          >
            {fixedCategoryLabel ?? (fixedCategory.trim() || 'Ohne Kat.')}
          </span>
        ) : (
          <CategoryPickerButton
            value={values.category}
            suggestions={categorySuggestions}
            buttonLabel={values.category.trim() ? values.category : 'Kat.'}
            title="Kategorie für diese neue Zeile"
            onChange={(c) => {
              patch('category', c)
              if (c.trim()) onCategoryPicked?.(c.trim())
            }}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
          />
        )}
      </td>
      <td className="px-1 py-0.5">
        {cell(
          'location',
          <input
            list={MACHINE_LOCATION_DATALIST_ID}
            value={values.location}
            onChange={(e) => patch('location', e.target.value)}
            onFocus={() => onSelectField('location')}
            placeholder="Standort…"
            className={inputCls}
          />,
        )}
      </td>
      <td className="px-1 py-0.5">
        {cell(
          'status',
          <select
            value={values.status}
            onChange={(e) => patch('status', e.target.value)}
            onFocus={() => onSelectField('status')}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>,
        )}
      </td>
      <td className="text-kwd-muted px-2 py-0.5 text-center text-xs">–</td>
      <td className="px-1 py-0.5">
        {cell(
          'lastMaintenance',
          <input
            type="date"
            value={values.lastMaintenance}
            onChange={(e) => patch('lastMaintenance', e.target.value)}
            onFocus={() => onSelectField('lastMaintenance')}
            className={dateInputCls(values.lastMaintenance)}
          />,
        )}
      </td>
      <td className="px-1 py-0.5">
        {cell(
          'nextMaintenance',
          <input
            type="date"
            value={values.nextMaintenance}
            onChange={(e) => patch('nextMaintenance', e.target.value)}
            onFocus={() => onSelectField('nextMaintenance')}
            className={dateInputCls(values.nextMaintenance)}
          />,
        )}
      </td>
      <td className="px-1 py-0.5">
        {cell(
          'lastRepair',
          <input
            type="date"
            value={values.lastRepair}
            onChange={(e) => patch('lastRepair', e.target.value)}
            onFocus={() => onSelectField('lastRepair')}
            className={dateInputCls(values.lastRepair)}
          />,
        )}
      </td>
      <td className="px-1 py-0.5">
        {cell(
          'warrantyUntil',
          <input
            type="date"
            value={values.warrantyUntil}
            onChange={(e) => patch('warrantyUntil', e.target.value)}
            onFocus={() => onSelectField('warrantyUntil')}
            className={dateInputCls(values.warrantyUntil)}
          />,
        )}
      </td>
      <td className="px-1 py-0.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {hasContent && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSaveRequest()
              }}
              disabled={saving}
              className="kwd-btn kwd-btn-primary hidden min-h-[40px] min-w-[4.5rem] px-2 text-xs font-bold lg:inline-flex"
            >
              {saving ? '…' : 'OK'}
            </button>
          )}
          {hasContent && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
              disabled={saving}
              className="text-kwd-muted hidden min-h-[40px] px-2 text-xs hover:underline lg:inline"
              title="Zeile leeren"
            >
              ✕
            </button>
          )}
          {error && (
            <p className="text-kwd-danger max-w-[120px] text-[10px] leading-tight">{error}</p>
          )}
        </div>
      </td>
    </tr>
    {hasContent && (
      <tr className="bg-kwd-primary/10 border-kwd-border border-b lg:hidden">
        <td colSpan={12} className="px-2 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSaveRequest()
              }}
              disabled={saving}
              className="kwd-btn kwd-btn-primary min-h-[48px] flex-1 text-sm font-bold"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
              disabled={saving}
              className="kwd-btn min-h-[48px] px-4 text-sm"
            >
              Leeren
            </button>
          </div>
        </td>
      </tr>
    )}
  </>
  )
}

export function validateDraft(values: MachineDraftValues): string | null {
  if (!values.name.trim()) return 'Bezeichnung erforderlich'
  if (!values.location.trim()) return 'Standort erforderlich'
  let code = values.barcode.trim()
  if (!code) code = suggestMachineBarcode(values.name)
  const validation = validateBarcode(code)
  if (!validation.valid) return validation.error ?? 'Ungültiger Code'
  return null
}

export function draftToInput(values: MachineDraftValues) {
  let code = values.barcode.trim()
  if (!code) code = suggestMachineBarcode(values.name)
  return {
    barcode: normalizeBarcode(code),
    name: values.name.trim(),
    label_name: values.labelName.trim() || null,
    category: values.category.trim() || null,
    location: values.location.trim(),
    warranty_until: values.warrantyUntil || null,
    status: values.status,
    last_maintenance_at: values.lastMaintenance || null,
    next_maintenance_at: values.nextMaintenance || null,
    last_repair_at: values.lastRepair || null,
  }
}
