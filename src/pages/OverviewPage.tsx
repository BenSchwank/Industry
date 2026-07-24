import { useOverviewStats } from '../hooks/useOverviewStats'
import { useNavBadges } from '../hooks/useNavBadges'
import { useAppStore, type AppView } from '../stores/appStore'
import { Tip } from '../components/ui/Tip'
import { NavCount } from '../components/ui/NavCount'

const QUICK_LINKS: { view: AppView; label: string; desc: string }[] = [
  { view: 'scanner', label: 'Scanner', desc: 'Code erfassen' },
  { view: 'machines', label: 'Maschinen', desc: 'Liste & Akte' },
  { view: 'chat', label: 'Chat', desc: 'Team schreiben' },
  { view: 'messages', label: 'Nachrichten', desc: 'Wartung & Docs' },
  { view: 'tickets', label: 'Störungen', desc: 'Meldungen' },
  { view: 'maintenance', label: 'Reparaturen', desc: 'HU & Termine' },
]

export default function OverviewPage() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const { data: stats, isLoading } = useOverviewStats()
  const badges = useNavBadges()

  return (
    <div className="flex flex-col gap-3 p-3 lg:gap-4 lg:p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight lg:text-2xl">Übersicht</h2>
          <Tip>
            <p className="text-kwd-muted text-sm">Kennzahlen und Schnellzugriff</p>
          </Tip>
        </div>
      </header>

      <div className="kwd-panel">
        <div className="grid grid-cols-2 divide-kwd-border lg:grid-cols-4 lg:divide-x">
          <Kpi
            label="Maschinen"
            value={isLoading ? '…' : stats?.machines}
            onClick={() => setActiveView('machines')}
          />
          <Kpi
            label="Offene Störungen"
            value={isLoading ? '…' : stats?.openTickets}
            alert={(stats?.openTickets ?? 0) > 0}
            onClick={() => setActiveView('tickets')}
          />
          <Kpi
            label="HU überfällig"
            value={isLoading ? '…' : stats?.overdueHu}
            alert={(stats?.overdueHu ?? 0) > 0}
            onClick={() => setActiveView('maintenance')}
          />
          <Kpi
            label="Bald fällig"
            value={isLoading ? '…' : stats?.dueSoon}
            alert={(stats?.dueSoon ?? 0) > 0}
            onClick={() => setActiveView('maintenance')}
          />
        </div>
      </div>

      <div className="kwd-panel">
        <div className="kwd-panel-head">Schnellzugriff</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {QUICK_LINKS.map(({ view, label, desc }) => {
            const badge =
              view === 'messages'
                ? badges.messages
                : view === 'chat'
                  ? badges.chat
                  : 0
            return (
              <button
                key={view}
                type="button"
                onClick={() => setActiveView(view)}
                className="border-kwd-border hover:bg-kwd-surface-light flex min-h-[64px] flex-col items-start justify-center border-b px-4 py-3 text-left sm:border-r"
              >
                <span className="flex items-center gap-2 font-semibold">
                  {label}
                  {badge > 0 && <NavCount value={badge} />}
                </span>
                <Tip>
                  <span className="text-kwd-muted text-sm">{desc}</span>
                </Tip>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  alert,
  onClick,
}: {
  label: string
  value: number | string | undefined
  alert?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kwd-kpi border-kwd-border border-b text-left last:border-b-0 lg:border-b-0 ${
        alert ? 'bg-kwd-danger/5' : ''
      }`}
    >
      <p className="kwd-kpi-label">{label}</p>
      <p className={`kwd-kpi-value ${alert ? 'text-kwd-danger' : ''}`}>{value ?? 0}</p>
    </button>
  )
}
