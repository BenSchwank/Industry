import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  normalizeBarcode,
  suggestMachineBarcode,
  validateBarcode,
} from '../../lib/barcode'
import { mapPasteRowToMachine } from '../../lib/excelClipboard'
import type { MachineStatus } from '../../types/database'
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
  | 'location'
  | 'status'
  | 'lastMaintenance'
  | 'nextMaintenance'
  | 'lastRepair'
  | 'warrantyUntil'

export interface MachineDraftValues {
  barcode: string
  name: string
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
}

export const EMPTY_DRAFT: MachineDraftValues = {
  barcode: '',
  name: '',
  location: '',
  status: 'active',
  lastMaintenance: '',
  nextMaintenance: '',
  lastRepair: '',
  warrantyUntil: '',
}

export function MachineAddRow({
  values: controlled,
  blank = false,
  selectedField,
  onSelectField,
  onChange,
  onFillDown,
  onSaveRequest,
  onCancel,
  registerRef,
  error,
  saving,
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
    <tr
      className={`border-kwd-border border-b ${
        hasContent ? 'bg-kwd-primary/10' : 'bg-kwd-paper hover:bg-kwd-surface-light'
      }`}
      onKeyDown={handleKeyDown}
    >
      <td className="border-kwd-border border px-2" />
      <td className="border-kwd-border border px-1 py-0.5">
        {cell(
          'barcode',
          <div className="flex gap-1">
            <input
              value={values.barcode}
              onChange={(e) => patch('barcode', e.target.value)}
              onFocus={() => onSelectField('barcode')}
              placeholder=""
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
      <td className="border-kwd-border border px-1 py-0.5">
        {cell(
          'name',
          <input
            ref={nameRef}
            value={values.name}
            onChange={(e) => patch('name', e.target.value)}
            onFocus={() => onSelectField('name')}
            placeholder=""
            className={inputCls}
          />,
        )}
      </td>
      <td className="border-kwd-border border px-1 py-0.5">
        {cell(
          'location',
          <input
            value={values.location}
            onChange={(e) => patch('location', e.target.value)}
            onFocus={() => onSelectField('location')}
            placeholder=""
            className={inputCls}
          />,
        )}
      </td>
      <td className="border-kwd-border border px-1 py-0.5">
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
      <td className="border-kwd-border text-kwd-muted border px-2 py-0.5 text-center text-xs">
        –
      </td>
      <td className="border-kwd-border border px-1 py-0.5">
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
      <td className="border-kwd-border border px-1 py-0.5">
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
      <td className="border-kwd-border border px-1 py-0.5">
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
      <td className="border-kwd-border border px-1 py-0.5">
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
      <td className="border-kwd-border border px-2 py-0.5">
        {hasContent || !blank ? (
          <div className="flex items-center gap-1">
            {saving ? (
              <span className="text-kwd-muted text-[10px]">…</span>
            ) : (
              <span className="text-kwd-muted text-[10px]">↵</span>
            )}
            {hasContent && (
              <button
                type="button"
                onClick={onCancel}
                className="text-kwd-muted text-[10px] hover:underline"
                title="Zeile leeren"
              >
                ✕
              </button>
            )}
            {error && (
              <p className="text-kwd-danger max-w-[120px] text-[10px] leading-tight">{error}</p>
            )}
          </div>
        ) : null}
      </td>
    </tr>
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
    location: values.location.trim(),
    warranty_until: values.warrantyUntil || null,
    status: values.status,
    last_maintenance_at: values.lastMaintenance || null,
    next_maintenance_at: values.nextMaintenance || null,
    last_repair_at: values.lastRepair || null,
  }
}
