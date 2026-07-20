import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  resetKey?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[KWD] Render-Fehler:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-bold">App-Fehler</h1>
          <p className="text-kwd-muted max-w-md text-sm">{this.state.error.message}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="bg-kwd-surface-light rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-kwd-primary text-kwd-bg rounded-lg px-4 py-2 text-sm font-bold"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
