/** Kleines Badge für Nav / Schnellzugriff */
export function NavCount({ value }: { value: number }) {
  if (value <= 0) return null
  return (
    <span className="bg-kwd-danger text-kwd-bg inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none">
      {value > 99 ? '99+' : value}
    </span>
  )
}
