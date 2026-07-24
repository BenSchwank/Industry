import { lazy, Suspense } from 'react'
import { AppShell } from './components/layout/AppShell'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { LoadingFallback } from './components/ui/LoadingFallback'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import { useAppStore } from './stores/appStore'
import { useAuthStore } from './stores/authStore'
import { useIsDesktop } from './hooks/usePlatform'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const ScannerPage = lazy(() => import('./pages/ScannerPage'))
const MachinesPage = lazy(() => import('./pages/MachinesPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const TicketsPage = lazy(() => import('./pages/TicketsPage'))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const UsersAdminPage = lazy(() => import('./pages/UsersAdminPage'))
const MobileMorePage = lazy(() => import('./pages/MobileMorePage'))

function ActivePage() {
  const activeView = useAppStore((s) => s.activeView)
  const isDesktop = useIsDesktop()

  if (activeView === 'import' && !isDesktop) {
    return <MobileMorePage />
  }

  switch (activeView) {
    case 'overview':
      return <OverviewPage />
    case 'scanner':
      return <ScannerPage />
    case 'machines':
      return <MachinesPage />
    case 'inventory':
      return <InventoryPage />
    case 'tickets':
      return <TicketsPage />
    case 'maintenance':
      return <MaintenancePage />
    case 'messages':
      return <MessagesPage />
    case 'chat':
      return <ChatPage />
    case 'import':
      return <ImportPage />
    case 'users':
      return <UsersAdminPage />
    case 'settings':
      return <SettingsPage />
    case 'more':
      return <MobileMorePage />
    default:
      return <OverviewPage />
  }
}

function App() {
  const initialized = useAuthStore((s) => s.initialized)
  const session = useAuthStore((s) => s.session)
  const authSkipped = useAppStore((s) => s.authSkipped)
  const stayOnApprovals = useAppStore((s) => s.stayOnApprovals)
  const activeView = useAppStore((s) => s.activeView)

  if (!initialized) {
    return <LoadingFallback label="Starte App…" />
  }

  if ((!session && !authSkipped) || stayOnApprovals) {
    return (
      <AppShell>
        <LoginPage />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <DashboardLayout>
        <ErrorBoundary resetKey={activeView}>
          <Suspense fallback={<LoadingFallback />}>
            <ActivePage />
          </Suspense>
        </ErrorBoundary>
      </DashboardLayout>
    </AppShell>
  )
}

export default App
