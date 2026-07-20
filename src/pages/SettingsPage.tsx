import { useThemeStore } from '../stores/themeStore'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { usePlatform } from '../hooks/usePlatform'
import { setPlatformOverride } from '../lib/platform'
import { UserApprovalsPanel } from '../components/auth/UserApprovalsPanel'

export default function SettingsPage() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const showTips = usePreferencesStore((s) => s.showTips)
  const setShowTips = usePreferencesStore((s) => s.setShowTips)
  const navLayout = usePreferencesStore((s) => s.navLayout)
  const setNavLayout = usePreferencesStore((s) => s.setNavLayout)
  const sidebarCollapsed = usePreferencesStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = usePreferencesStore((s) => s.setSidebarCollapsed)
  const tableListMode = usePreferencesStore((s) => s.tableListMode)
  const setTableListMode = usePreferencesStore((s) => s.setTableListMode)
  const platform = usePlatform()
  const authSkipped = useAppStore((s) => s.authSkipped)
  const setAuthSkipped = useAppStore((s) => s.setAuthSkipped)
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
      <header className="mb-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Einstellungen</h2>
        <p className="text-kwd-muted mt-1 text-sm">Darstellung und Bedienung</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="kwd-panel">
          <div className="kwd-panel-head">Darstellung</div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`kwd-btn min-h-[52px] ${theme === 'light' ? 'kwd-btn-primary' : ''}`}
            >
              Hell
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`kwd-btn min-h-[52px] ${theme === 'dark' ? 'kwd-btn-primary' : ''}`}
            >
              Dunkel
            </button>
          </div>
        </section>

        <section className="kwd-panel">
          <div className="kwd-panel-head">Hilfen & Tipps</div>
          <p className="text-kwd-muted border-kwd-border border-b px-4 py-2 text-sm">
            Erklärtexte für erfahrene Nutzer abschalten.
          </p>
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              type="button"
              onClick={() => setShowTips(true)}
              className={`kwd-btn min-h-[52px] ${showTips ? 'kwd-btn-primary' : ''}`}
            >
              Tipps an
            </button>
            <button
              type="button"
              onClick={() => setShowTips(false)}
              className={`kwd-btn min-h-[52px] ${!showTips ? 'kwd-btn-primary' : ''}`}
            >
              Tipps aus
            </button>
          </div>
        </section>

        <section className="kwd-panel md:col-span-2">
          <div className="kwd-panel-head">Maschinenliste</div>
          <p className="text-kwd-muted border-kwd-border border-b px-4 py-2 text-sm">
            Endlos: viele leere Zeilen zum Scrollen. Fortlaufend: neue Zeile nur nach der letzten.
          </p>
          <div className="grid grid-cols-2 gap-3 p-4 sm:mx-auto sm:max-w-xl">
            <button
              type="button"
              onClick={() => setTableListMode('infinite')}
              className={`kwd-btn min-h-[52px] ${tableListMode === 'infinite' ? 'kwd-btn-primary' : ''}`}
            >
              Endlos-Liste
            </button>
            <button
              type="button"
              onClick={() => setTableListMode('continuous')}
              className={`kwd-btn min-h-[52px] ${tableListMode === 'continuous' ? 'kwd-btn-primary' : ''}`}
            >
              Fortlaufende Liste
            </button>
          </div>
        </section>

        <section className="kwd-panel md:col-span-2">
          <div className="kwd-panel-head">Navigation</div>
          <p className="text-kwd-muted border-kwd-border border-b px-4 py-2 text-sm">
            Hauptmenü in einer Zeile mit dem Logo (Excel-Stil) oder als Seitenleiste links.
          </p>
          <div className="grid grid-cols-2 gap-3 p-4 sm:max-w-xl sm:mx-auto">
            <button
              type="button"
              onClick={() => setNavLayout('sidebar')}
              className={`kwd-btn min-h-[52px] ${navLayout === 'sidebar' ? 'kwd-btn-primary' : ''}`}
            >
              Seitenleiste
            </button>
            <button
              type="button"
              onClick={() => setNavLayout('top')}
              className={`kwd-btn min-h-[52px] ${navLayout === 'top' ? 'kwd-btn-primary' : ''}`}
            >
              Oben-Menü
            </button>
          </div>
          {navLayout === 'sidebar' && (
            <div className="border-kwd-border flex flex-wrap items-center justify-center gap-2 border-t p-4">
              <span className="text-kwd-muted text-sm">Leiste:</span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className={`kwd-btn ${!sidebarCollapsed ? 'kwd-btn-primary' : ''}`}
              >
                Ausgeklappt
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className={`kwd-btn ${sidebarCollapsed ? 'kwd-btn-primary' : ''}`}
              >
                Eingeklappt
              </button>
            </div>
          )}
        </section>

        <section className="kwd-panel">
          <div className="kwd-panel-head">Ansicht</div>
          <p className="text-kwd-muted border-kwd-border border-b px-4 py-2 text-sm">
            Aktiv: {platform === 'desktop' ? 'Desktop' : 'Mobil'}
          </p>
          <div className="flex flex-wrap gap-2 p-4">
            <button
              type="button"
              className="kwd-btn"
              onClick={() => {
                setPlatformOverride('desktop')
                window.location.reload()
              }}
            >
              Desktop
            </button>
            <button
              type="button"
              className="kwd-btn"
              onClick={() => {
                setPlatformOverride('mobile')
                window.location.reload()
              }}
            >
              Mobil
            </button>
            <button
              type="button"
              className="kwd-btn"
              onClick={() => {
                setPlatformOverride(null)
                window.location.reload()
              }}
            >
              Automatisch
            </button>
          </div>
        </section>

        <section className="kwd-panel">
          <div className="kwd-panel-head">Konto</div>
          <div className="p-4">
            {session ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">
                  {profile?.username ?? session.user.email?.split('@')[0]}
                  {profile?.role === 'admin' ? ' · Admin' : ''}
                </span>
                <button type="button" onClick={() => signOut()} className="kwd-btn">
                  Abmelden
                </button>
              </div>
            ) : (
              <div>
                <p className="text-kwd-muted text-sm">
                  {authSkipped ? 'Dev-Modus ohne Anmeldung' : 'Nicht angemeldet'}
                </p>
                {authSkipped && (
                  <button
                    type="button"
                    className="kwd-btn mt-2"
                    onClick={() => {
                      setAuthSkipped(false)
                      window.location.reload()
                    }}
                  >
                    Zur Anmeldung
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <UserApprovalsPanel />
      </div>
    </div>
  )
}
