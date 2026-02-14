'use client'

import { useEffect } from 'react'
import { getPreferencesOptional } from '@/app/settings/appearance/actions'
import { applyTheme, loadFromStorage, saveToStorage } from '@/lib/theme'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = loadFromStorage()
    applyTheme(stored)

    getPreferencesOptional().then((prefs) => {
      if (prefs) {
        const next = {
          theme_mode: prefs.theme_mode,
          primary_color: prefs.primary_color,
          secondary_color: prefs.secondary_color,
          third_color: prefs.third_color,
        }
        saveToStorage(next)
        applyTheme(next)
      }
    })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const stored = loadFromStorage()
      if (stored.theme_mode === 'system') {
        applyTheme(stored)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return <>{children}</>
}
