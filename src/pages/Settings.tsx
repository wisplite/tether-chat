import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { ArrowLeftIcon, PaletteIcon, SignOutIcon, UserIcon, type Icon } from '@phosphor-icons/react'
import { useTether } from '@tetherdb/react'

type Page = {
    name: string
    path: string
    icon: Icon
}

const pages: Page[] = [
    {
        name: 'Profile',
        path: '/settings/profile',
        icon: UserIcon
    },
    { name: 'Appearance', path: '/settings/appearance', icon: PaletteIcon }
]

function PageItem({ page }: { page: Page }) {
    const path = useLocation().pathname
    const active = path === page.path
    return (
        <div className="group relative w-full">
            <Link to={page.path} aria-current={active ? 'page' : undefined} className={`flex min-h-8 w-full items-center gap-1.5 rounded-[2px] p-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-primary ${active ? 'bg-accent-light text-foreground' : 'text-foreground-muted hover:bg-foreground-muted-hover hover:text-foreground'}`}>
                <page.icon size={16} className={`shrink-0 ${active ? 'text-accent' : 'text-foreground-muted'}`} />
                <span className="truncate">{page.name}</span>
            </Link>
        </div>
    )
}

function Settings() {
    const navigate = useNavigate()
    const { logout } = useTether()

    const handleLogout = () => {
        localStorage.removeItem('token')
        logout()
        navigate('/')
    }
    return (
        <div className="flex h-dvh w-full flex-col overflow-hidden sm:flex-row bg-background">
            <aside aria-label="Settings" className="flex shrink-0 flex-col border-b sm:h-full sm:w-[200px] sm:border-b-0 sm:border-r border-background-tertiary bg-background-secondary">
                <div className="px-4 pt-5 pb-3 text-lg font-bold">Settings</div>
                <div className="min-h-0 flex-1 flex flex-col gap-0.5 justify-between overflow-y-auto p-2">
                    <div className="flex gap-1 sm:flex-col">
                        {pages.map((page) => (
                            <PageItem key={page.path} page={page} />
                        ))}
                    </div>
                    <div className="flex flex-col gap-1">
                        <button onClick={() => handleLogout()} className="rounded-md bg-error p-2 text-sm text-white hover:bg-error/80 cursor-pointer flex flex-row gap-1 items-center justify-center">
                            <SignOutIcon size={16} className="shrink-0 text-white" />
                            <span className="truncate">Log Out</span>
                        </button>
                        <button onClick={() => navigate('/chat')} className="rounded-md bg-background-tertiary p-2 text-sm text-foreground hover:bg-background-tertiary/80 cursor-pointer flex flex-row gap-1 items-center justify-center">
                            <ArrowLeftIcon size={16} className="shrink-0" />
                            <span className="truncate">Back to Chat</span>
                        </button>
                    </div>
                </div>
            </aside>
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
                <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6 lg:p-10">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default Settings
