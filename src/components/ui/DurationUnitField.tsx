import type { ReactNode } from 'react'
import { DAYS_PER_YEAR, type DurationUnit, toDurationDays } from '../../lib/maintenanceDue'

interface DurationUnitFieldProps {
  label: string
  value: string
  unit: DurationUnit
  onValueChange: (value: string) => void
  onUnitChange: (unit: DurationUnit) => void
  required?: boolean
  hint?: ReactNode
  className?: string
  inputClassName?: string
}

/** Zahl + Umschalter Tage / Jahre für Wartungsintervalle */
export function DurationUnitField({
  label,
  value,
  unit,
  onValueChange,
  onUnitChange,
  required,
  hint,
  className = '',
  inputClassName = 'border-kwd-border bg-kwd-surface min-h-[44px] w-full border px-3',
}: DurationUnitFieldProps) {
  function switchUnit(next: DurationUnit) {
    if (next === unit) return
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) {
      if (unit === 'days' && next === 'years') {
        const years =
          n >= DAYS_PER_YEAR && n % DAYS_PER_YEAR === 0
            ? n / DAYS_PER_YEAR
            : Math.max(1, Math.round(n / DAYS_PER_YEAR))
        onValueChange(String(years))
      } else if (unit === 'years' && next === 'days') {
        onValueChange(String(toDurationDays(n, 'years')))
      }
    }
    onUnitChange(next)
  }

  return (
    <div className={className}>
      <span className="text-kwd-muted text-sm font-medium">{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          required={required}
          placeholder={unit === 'years' ? 'z.B. 1' : 'z.B. 90'}
          className={`${inputClassName} min-w-0 flex-1`}
          aria-label={label}
        />
        <div
          className="border-kwd-border bg-kwd-surface flex shrink-0 overflow-hidden border"
          role="group"
          aria-label="Einheit"
        >
          <button
            type="button"
            onClick={() => switchUnit('days')}
            className={`min-h-[44px] px-3 text-sm font-semibold ${
              unit === 'days' ? 'bg-kwd-primary text-white' : 'text-kwd-muted hover:bg-kwd-bg'
            }`}
          >
            Tage
          </button>
          <button
            type="button"
            onClick={() => switchUnit('years')}
            className={`min-h-[44px] px-3 text-sm font-semibold ${
              unit === 'years' ? 'bg-kwd-primary text-white' : 'text-kwd-muted hover:bg-kwd-bg'
            }`}
          >
            Jahre
          </button>
        </div>
      </div>
      {hint}
    </div>
  )
}

export function parseDurationInput(
  value: string,
  unit: DurationUnit,
): { ok: true; days: number } | { ok: false } {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return { ok: false }
  const days = toDurationDays(n, unit)
  if (days < 1) return { ok: false }
  return { ok: true, days }
}
