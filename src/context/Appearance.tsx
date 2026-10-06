import { useState, type ReactNode } from 'react'
import { AppearanceContext, initialAppearance, applyAppearance, type Theme, type Accent } from './appearanceState'

export function AppearanceProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferences] = useState(initialAppearance)
    const [notice, setNotice] = useState('')
    const update = (theme: Theme, accent: Accent) => {
        setPreferences({ theme, accent })
        applyAppearance(theme, accent)
        try {
            localStorage.setItem('tether-appearance', JSON.stringify({ theme, accent }))
            setNotice('Appearance saved on this browser.')
        } catch {
            setNotice('Appearance applied. Your browser could not save it for next time.')
        }
    }
    return <AppearanceContext.Provider value={{ ...preferences, notice, update }}>{children}</AppearanceContext.Provider>
}

