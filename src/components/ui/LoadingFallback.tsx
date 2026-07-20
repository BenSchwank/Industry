export function LoadingFallback({ label = 'Lade Modul…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-8"
      style={{ minHeight: '100svh', background: '#0f172a', color: '#94a3b8' }}
    >
      <div
        className="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
        style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }}
        role="status"
        aria-label={label}
      />
      <p className="text-sm font-medium" style={{ color: '#f8fafc' }}>
        {label}
      </p>
    </div>
  )
}
