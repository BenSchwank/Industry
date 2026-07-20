import { useEffect, useState } from 'react'
import { detectPlatform, type Platform } from '../lib/platform'

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(detectPlatform)

  useEffect(() => {
    const update = () => setPlatform(detectPlatform())
    window.addEventListener('resize', update)
    window.addEventListener('kwd-platform-change', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('kwd-platform-change', update)
    }
  }, [])

  return platform
}

export function useIsDesktop(): boolean {
  return usePlatform() === 'desktop'
}

export function useIsMobile(): boolean {
  return usePlatform() === 'mobile'
}
