import { useAppStore } from '../../stores/appStore'
import { usePreferencesStore } from '../../stores/preferencesStore'
import { useAuthStore } from '../../stores/authStore'
import { ADMIN_NAV, DESKTOP_NAV } from '../../lib/navItems'

const SHORT: Record<string, string> = {
  overview: 'Üb.',
  scanner: 'Scan',
  machines: 'Masch.',
  inventory: 'Lager',
  tickets: 'Stör.',
  maintenance: 'Rep.',
  messages: 'Nachr.',
  import: 'QS1',
  users: 'Verw.',
  settings: 'Einst.',
}

export function SideNav() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const collapsed = usePreferencesStore((s) => s.sidebarCollapsed)
  const toggleSidebarCollapsed = usePreferencesStore((s) => s.toggleSidebarCollapsed)
  const navLayout = usePreferencesStore((s) => s.navLayout)
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin' && profile.status === 'active'
  const navItems = isAdmin ? [...DESKTOP_NAV, ...ADMIN_NAV] : DESKTOP_NAV

  if (navLayout !== 'sidebar') return null

  return (
    <aside
      className={`bg-kwd-surface border-kwd-border hidden shrink-0 border-r lg:flex lg:flex-col ${
        collapsed ? 'w-14' : 'w-52 xl:w-56'
      }`}
    >
      <nav
        className="sticky top-[49px] flex min-h-[calc(100svh-49px)] flex-col gap-1 p-1.5"
        aria-label="Hauptmenü"
      >
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          className="kwd-btn mb-1 justify-center px-2 text-xs"
          title={collapsed ? 'Leiste ausklappen' : 'Leiste einklappen'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '»' : '«'}
        </button>

        <ul className="flex flex-col gap-0.5">
          {navItems.map(({ view, label }) => {
            const isActive = activeView === view
            return (
              <li key={view}>
                <button
                  type="button"
                  onClick={() => setActiveView(view)}
                  title={label}
                  className={`kwd-nav-item ${collapsed ? 'justify-center px-1' : ''} ${
                    isActive ? 'kwd-nav-item-active' : ''
                  }`}
                >
                  {collapsed ? SHORT[view] ?? label.slice(0, 1) : label}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="border-kwd-border mt-auto border-t pt-2">
          <button
            type="button"
            onClick={() => setActiveView('settings')}
            title="Einstellungen"
            className={`kwd-nav-item ${collapsed ? 'justify-center px-1' : ''} ${
              activeView === 'settings' ? 'kwd-nav-item-active' : ''
            }`}
          >
            {collapsed ? '⚙' : 'Einstellungen'}
          </button>
        </div>
      </nav>
    </aside>
  )
}
