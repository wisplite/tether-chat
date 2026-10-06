import { createContext, useContext } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type Accent = 'blue' | 'violet' | 'green' | 'rose'
const accents: Record<Accent, [string, string]> = {
    blue: ['#3d60bb', '#879bff'],
    violet: ['#7742bb', '#b69af5'],
    green: ['#197450', '#61c99b'],
    rose: ['#ad3562', '#ec92b3'],
}
function readPreferences(): { theme: Theme, accent: Accent } {
    try {
        const value = JSON.parse(localStorage.getItem('tether-appearance') || '{}')
        return {
            theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
            accent: Object.hasOwn(accents, value.accent) ? value.accent : 'blue',
        }
    } catch {
        return { theme: 'system', accent: 'blue' }
    }
}
export function applyAppearance(theme: Theme, accent: Accent) {
    document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme
    const [light, dark] = accents[accent]
    document.documentElement.style.setProperty('--color-accent', `light-dark(${light}, ${dark})`)
    document.documentElement.style.setProperty('--color-brand-primary', `light-dark(${light}, ${dark})`)
}
export const initialAppearance = readPreferences()
applyAppearance(initialAppearance.theme, initialAppearance.accent)
export const AppearanceContext = createContext<{
    theme: Theme, accent: Accent, notice: string,
    update: (theme: Theme, accent: Accent) => void,
} | null>(null)


export function useAppearance() {
    const context = useContext(AppearanceContext)
    if (!context) throw new Error('AppearanceProvider is required')
    return context
}
