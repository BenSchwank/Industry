import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'
import { useNavBadges } from '../hooks/useNavBadges'
import { NavCount } from '../components/ui/NavCount'

const LINKS = [
  { view: 'overview' as const, label: 'Übersicht', desc: 'Dashboard & KPIs', icon: '◉' },
  { view: 'chat' as const, label: 'Team-Chat', desc: 'Mit Kollegen schreiben & Bilder', icon: '💬' },
  { view: 'machines' as const, label: 'Maschinen', desc: 'Akte, QR-Labels', icon: '⚙' },
  { view: 'messages' as const, label: 'Nachrichten', desc: 'HU, Docs, Störungen', icon: '✉' },
  { view: 'inventory' as const, label: 'Lager', desc: 'FIFO, Bestände', icon: '📦' },
  { view: 'tickets' as const, label: 'Störungen', desc: 'Alle Meldungen', icon: '⚠' },
  { view: 'settings' as const, label: 'Einstellungen', desc: 'Hell/Dunkel & mehr', icon: '⚙' },
]

export default function MobileMorePage() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin' && profile.status === 'active'
  const badges = useNavBadges()

  const links = isAdmin
    ? [
        ...LINKS.slice(0, -1),
        {
          view: 'users' as const,
          label: 'Nutzerverwaltung',
          desc: 'Rechte, Freigaben, Nutzer löschen',
          icon: '👤',
        },
        LINKS[LINKS.length - 1],
      ]
    : LINKS

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h2 className="text-xl font-bold">Weitere Bereiche</h2>
        <p className="text-kwd-muted mt-1 text-sm">
          QS1-Import und erweiterte Verwaltung nur am Windows-Desktop.
        </p>
      </header>
      {links.map(({ view, label, desc, icon }) => {
        const badge =
          view === 'messages' ? badges.messages : view === 'chat' ? badges.chat : 0
        return (
          <button
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
            className="bg-kwd-surface flex min-h-[72px] items-center gap-4 rounded-xl p-4 text-left"
          >
            <span className="text-2xl" aria-hidden>
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-bold">
                {label}
                <NavCount value={badge} />
              </p>
              <p className="text-kwd-muted text-sm">{desc}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
