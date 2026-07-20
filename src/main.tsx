import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './stores/themeStore'
import App from './App.tsx'
import { AppProviders } from './providers/AppProviders.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
)
