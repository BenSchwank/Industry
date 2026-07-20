export type Platform = 'mobile' | 'desktop'

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop'

  const stored = sessionStorage.getItem('kwd-platform-override') as Platform | null
  if (stored === 'mobile' || stored === 'desktop') return stored

  const narrow = window.matchMedia('(max-width: 1023px)').matches
  const touch = window.matchMedia('(pointer: coarse)').matches
  const mobileUa = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)

  if (narrow || (touch && mobileUa)) return 'mobile'
  return 'desktop'
}

export function setPlatformOverride(platform: Platform | null) {
  if (platform) {
    sessionStorage.setItem('kwd-platform-override', platform)
  } else {
    sessionStorage.removeItem('kwd-platform-override')
  }
  window.dispatchEvent(new Event('kwd-platform-change'))
}
