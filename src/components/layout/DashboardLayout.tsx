import type { ReactNode } from 'react'
import { setPlatformOverride } from '../../lib/platform'
import { usePlatform } from '../../hooks/usePlatform'
import { DbSetupBanner } from '../setup/DbSetupBanner'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { SideNav } from './SideNav'

export function DashboardLayout({ children }: { children: ReactNode }) {
  const platform = usePlatform()

  return (
    <div className="bg-kwd-bg flex min-h-svh flex-col">
      <Header />
      <DbSetupBanner />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="flex w-full min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <BottomNav />
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => {
            setPlatformOverride(platform === 'desktop' ? 'mobile' : 'desktop')
            window.location.reload()
          }}
          className="kwd-btn fixed right-2 bottom-16 z-50 text-[10px] opacity-50 lg:bottom-2"
        >
          Dev: {platform === 'desktop' ? '→ Mobile' : '→ Desktop'}
        </button>
      )}
    </div>
  )
}
