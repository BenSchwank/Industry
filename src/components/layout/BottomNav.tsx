import { useAppStore, type AppView } from '../../stores/appStore'

const MOBILE_QUICK: { view: AppView; label: string }[] = [
  { view: 'overview', label: 'Start' },
  { view: 'scanner', label: 'Scan' },
  { view: 'tickets', label: 'Störung' },
  { view: 'maintenance', label: 'Wartung' },
  { view: 'more', label: 'Mehr' },
]

export function BottomNav() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)

  return (
    <nav
      className="bg-kwd-surface border-kwd-border safe-area-bottom sticky bottom-0 border-t lg:hidden"
      aria-label="Schnellnavigation"
    >
      <ul className="mx-auto flex max-w-2xl gap-1 p-1.5">
        {MOBILE_QUICK.map(({ view, label }) => {
          const isActive =
            activeView === view ||
            (view === 'more' &&
              ['machines', 'inventory', 'import', 'settings', 'messages'].includes(activeView))
          return (
            <li key={view} className="flex-1">
              <button
                type="button"
                onClick={() => setActiveView(view)}
                className={`flex w-full min-h-[48px] items-center justify-center rounded-md text-xs font-semibold ${
                  isActive
                    ? 'bg-kwd-primary/15 text-kwd-text shadow-[inset_0_-2px_0_var(--kwd-primary)]'
                    : 'text-kwd-muted'
                }`}
              >
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
