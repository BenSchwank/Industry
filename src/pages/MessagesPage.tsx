import { useMessageInbox, type InboxMessage } from '../hooks/useMessageInbox'
import { useAppStore } from '../stores/appStore'
import { Tip } from '../components/ui/Tip'

const SEVERITY_CLS = {
  alert: 'border-kwd-danger/40 bg-kwd-danger/10',
  warn: 'border-kwd-warning/40 bg-kwd-warning/10',
  info: 'border-kwd-border bg-kwd-surface',
  ok: 'border-kwd-success/40 bg-kwd-success/10',
} as const

const SEVERITY_LABEL = {
  alert: 'Dringend',
  warn: 'Bald',
  info: 'Info',
  ok: 'Bereit',
} as const

export default function MessagesPage() {
  const { data: messages = [], isLoading } = useMessageInbox()
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSelectedMachineId = useAppStore((s) => s.setSelectedMachineId)
  const setMachineDetailFocus = useAppStore((s) => s.setMachineDetailFocus)

  const counts = {
    alert: messages.filter((m) => m.severity === 'alert').length,
    warn: messages.filter((m) => m.severity === 'warn').length,
    info: messages.filter((m) => m.severity === 'info').length,
    ok: messages.filter((m) => m.severity === 'ok').length,
  }

  function openMachine(msg: InboxMessage) {
    if (!msg.machineId) return
    setSelectedMachineId(msg.machineId)
    setMachineDetailFocus(true)
    setActiveView('machines')
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">Nachrichtencenter</h2>
        <Tip>
          <p className="text-kwd-muted text-sm">
            Wartungen, Störungen und Dokument-Analysen an einem Ort
          </p>
        </Tip>
      </header>

      <div className="kwd-panel">
        <div className="grid grid-cols-2 divide-kwd-border lg:grid-cols-4 lg:divide-x">
          <Stat label="Dringend" value={isLoading ? '…' : counts.alert} alert={counts.alert > 0} />
          <Stat label="Bald fällig" value={isLoading ? '…' : counts.warn} />
          <Stat label="Info" value={isLoading ? '…' : counts.info} />
          <Stat label="Pläne bereit" value={isLoading ? '…' : counts.ok} />
        </div>
      </div>

      <div className="kwd-panel">
        <div className="kwd-panel-head">
          {isLoading ? 'Laden…' : `${messages.length} Nachricht${messages.length === 1 ? '' : 'en'}`}
        </div>

        {!isLoading && messages.length === 0 && (
          <p className="text-kwd-muted px-4 py-10 text-center text-sm">
            Keine offenen Hinweise – alles ruhig.
          </p>
        )}

        <ul className="divide-kwd-border divide-y">
          {messages.map((msg) => (
            <li key={msg.id}>
              <button
                type="button"
                onClick={() => openMachine(msg)}
                disabled={!msg.machineId}
                className={`hover:bg-kwd-surface-light flex w-full flex-col gap-1 px-3 py-3 text-left disabled:cursor-default sm:flex-row sm:items-start sm:gap-3 ${SEVERITY_CLS[msg.severity]}`}
              >
                <span className="text-kwd-muted shrink-0 text-[10px] font-bold tracking-wide uppercase sm:w-16">
                  {SEVERITY_LABEL[msg.severity]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{msg.title}</p>
                  <p className="text-kwd-muted mt-0.5 text-sm">{msg.detail}</p>
                  {msg.machineName && (
                    <p className="text-kwd-primary mt-1 text-xs font-semibold">
                      {msg.machineName}
                    </p>
                  )}
                </div>
                <span className="text-kwd-muted shrink-0 text-xs">
                  {new Date(msg.occurredAt).toLocaleDateString('de-DE')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  alert,
}: {
  label: string
  value: string | number
  alert?: boolean
}) {
  return (
    <div className={`kwd-kpi ${alert ? 'bg-kwd-danger/10' : ''}`}>
      <p className="kwd-kpi-label">{label}</p>
      <p className="kwd-kpi-value">{value}</p>
    </div>
  )
}
