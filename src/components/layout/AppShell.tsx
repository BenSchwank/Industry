import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-col" style={{ minHeight: '100svh' }}>
      {children}
    </div>
  )
}
