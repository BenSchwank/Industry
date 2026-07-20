import type { ReactNode } from 'react'
import { usePreferencesStore } from '../../stores/preferencesStore'

/** Rendert Kinder nur, wenn Tipps in den Einstellungen aktiviert sind. */
export function Tip({ children }: { children: ReactNode }) {
  const showTips = usePreferencesStore((s) => s.showTips)
  if (!showTips) return null
  return children
}
