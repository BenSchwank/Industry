import { useAppStore } from '../../stores/appStore'
import { usePreferencesStore } from '../../stores/preferencesStore'
import { DESKTOP_NAV, ADMIN_NAV } from '../../lib/navItems'
import { isSupabaseConfigured } from '../../lib/supabase'
import { usePlatform } from '../../hooks/usePlatform'
import { useAuthStore } from '../../stores/authStore'
import { useOfflineTicketStore } from '../../stores/offlineTicketStore'
import { useNavBadges } from '../../hooks/useNavBadges'
import { NavCount } from '../ui/NavCount'

export function Header() {
  const platform = usePlatform()
  const isOnline = useAppStore((s) => s.isOnline)
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const authSkipped = useAppStore((s) => s.authSkipped)
  const signOut = useAuthStore((s) => s.signOut)
  const pendingCount = useOfflineTicketStore((s) => s.pending.length)
  const navLayout = usePreferencesStore((s) => s.navLayout)
  const topNav = navLayout === 'top'
  const isAdmin = profile?.role === 'admin' && profile.status === 'active'
  const navItems = isAdmin ? [...DESKTOP_NAV, ...ADMIN_NAV] : DESKTOP_NAV
  const badges = useNavBadges()

  return (
    <header className="bg-kwd-surface border-kwd-border sticky top-0 z-20 border-b">
      <div
        className={`flex w-full items-center gap-3 px-3 py-2 lg:px-4 ${
          topNav ? 'lg:gap-4' : 'justify-between px-4 py-2.5 lg:px-5'
        }`}
      >
        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            <span className="bg-kwd-primary h-2 w-2 shrink-0 rounded-full" aria-hidden />
            <p className="text-kwd-muted text-[11px] font-semibold tracking-wide uppercase">
              KWD Dresden
            </p>
          </div>
          <h1 className="truncate text-sm font-semibold tracking-tight lg:text-base">
            Instandhaltung
          </h1>
        </div>

        {topNav && (
          <nav
            className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex"
            aria-label="Hauptmenü"
          >
            {navItems.map(({ view, label }) => {
              const isActive = activeView === view
              const badge =
                view === 'messages' ? badges.messages : view === 'chat' ? badges.chat : 0
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  className={`kwd-nav-item w-auto shrink-0 px-2.5 py-1.5 text-sm ${
                    isActive ? 'kwd-nav-item-active' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    <NavCount value={badge} />
                  </span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          <span className="text-kwd-muted hidden xl:inline">
            {platform === 'desktop' ? 'Desktop' : 'Mobil'}
          </span>
          {pendingCount > 0 && (
            <span className="bg-kwd-warning/15 text-kwd-warning border-kwd-warning/30 border px-2 py-1 font-semibold">
              {pendingCount} Sync
            </span>
          )}
          {isSupabaseConfigured && <span className="text-kwd-muted hidden md:inline">DB</span>}
          <span
            className={`inline-flex items-center gap-1.5 border px-2 py-1 font-semibold ${
              isOnline
                ? 'border-kwd-success/30 bg-kwd-success/10 text-kwd-success'
                : 'border-kwd-danger/30 bg-kwd-danger/10 text-kwd-danger'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-kwd-success' : 'bg-kwd-danger'}`}
            />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {session ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="kwd-btn max-w-[120px] truncate py-1"
            >
              {profile?.username ?? session.user.email?.split('@')[0]}
            </button>
          ) : authSkipped ? (
            <span className="text-kwd-muted">Dev</span>
          ) : null}
          {topNav && (
            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className={`kwd-btn hidden lg:inline-flex ${
                activeView === 'settings' ? 'kwd-btn-primary' : ''
              }`}
            >
              Einstellungen
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
