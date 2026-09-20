import { useCallback, useEffect, useState } from 'react'
import type { AppTheme } from '@shared/types'

/** Loads the saved theme, applies it to the document root, and keeps it in sync with the OS
 *  preference when the user has chosen 'system'. */
export function useTheme(): { theme: AppTheme; setTheme: (theme: AppTheme) => void } {
  const [theme, setThemeState] = useState<AppTheme>('system')

  useEffect(() => {
    window.api.settings.get().then((settings) => setThemeState(settings.theme))
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.setAttribute('data-theme', resolved)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next)
    void window.api.settings.update({ theme: next })
  }, [])

  return { theme, setTheme }
}
