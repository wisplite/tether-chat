import { CheckIcon, DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { useAppearance, type Accent, type Theme } from '../../context/appearanceState'

const themes = [
    { value: 'light' as Theme, label: 'Light', description: 'A bright, clean workspace.', icon: SunIcon },
    { value: 'dark' as Theme, label: 'Dark', description: 'A softer look after hours.', icon: MoonIcon },
    { value: 'system' as Theme, label: 'System', description: 'Follow your device’s theme.', icon: DesktopIcon },
]
const accents: { value: Accent, label: string, color: string }[] = [
    { value: 'blue', label: 'Blue', color: '#3d60bb' },
    { value: 'violet', label: 'Violet', color: '#7742bb' },
    { value: 'green', label: 'Green', color: '#197450' },
    { value: 'rose', label: 'Rose', color: '#ad3562' },
]

export default function Appearance() {
    const { theme, accent, notice, update } = useAppearance()
    return (
        <div className="settings-page">
            <header className="settings-heading">
                <h1>Appearance</h1>
                <p>Make Tether feel like your space. Changes apply instantly.</p>
            </header>
            <section className="settings-panel" aria-labelledby="theme-heading">
                <h2 id="theme-heading" className="text-base font-semibold">Theme</h2>
                <p className="mt-1 text-foreground-muted">Choose a look for the whole app.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3" role="group" aria-label="Theme">
                    {themes.map(({ value, label, description, icon: Icon }) => (
                        <button key={value} type="button" aria-pressed={theme === value} onClick={() => update(value, accent)} className={`appearance-choice ${theme === value ? 'border-accent bg-accent/5' : 'border-background-tertiary hover:bg-foreground-muted-hover'}`}>
                            <div className={`theme-thumbnail ${value === 'dark' ? 'theme-dark' : value === 'light' ? 'theme-light' : 'theme-system'}`} aria-hidden="true">
                                <div className="theme-mini-sidebar"><Icon size={20} /></div>
                                <div className="flex flex-1 flex-col gap-2 p-3"><span className="h-2 w-2/3 rounded bg-current opacity-20" /><span className="h-2 w-full rounded bg-current opacity-10" /><span className="mt-auto h-5 w-2/3 rounded bg-accent" /></div>
                            </div>
                            <span className="mt-3 flex items-center justify-between font-semibold">{label}{theme === value && <CheckIcon size={18} className="text-accent" />}</span>
                            <span className="mt-1 block text-xs text-foreground-muted">{description}</span>
                        </button>
                    ))}
                </div>
            </section>
            <section className="settings-panel mt-4" aria-labelledby="accent-heading">
                <h2 id="accent-heading" className="text-base font-semibold">Accent color</h2>
                <p className="mt-1 text-foreground-muted">Personalize buttons, highlights, and profile banners.</p>
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Accent color">
                    {accents.map(({ value, label, color }) => <button key={value} type="button" aria-pressed={accent === value} onClick={() => update(theme, value)} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent ${accent === value ? 'border-accent bg-accent/5' : 'border-background-tertiary hover:bg-foreground-muted-hover'}`}><span className="flex size-5 items-center justify-center rounded-full text-white" style={{ background: color }}>{accent === value && <CheckIcon size={13} />}</span>{label}</button>)}
                </div>
            </section>
            <p role="status" className="mt-4 text-foreground-muted">{notice || 'These preferences are saved on this browser.'}</p>
        </div>
    )
}
