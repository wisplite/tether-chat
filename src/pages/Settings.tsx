import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { ArrowLeftIcon, UserIcon, type Icon } from '@phosphor-icons/react'

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
    }
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
    return (
        <div className="flex h-dvh w-full overflow-hidden bg-background">
            <aside aria-label="Settings" className="flex h-full w-36 shrink-0 flex-col border-r border-background-tertiary bg-background-secondary sm:w-[200px]">
                <div className="min-h-0 flex-1 flex flex-col gap-0.5 justify-between overflow-y-auto p-2">
                    <div className="flex flex-col gap-0.5">
                        {pages.map((page) => (
                            <PageItem key={page.path} page={page} />
                        ))}
                    </div>
                    <button onClick={() => navigate('/chat')} className="rounded-md bg-background-tertiary p-2 text-sm text-foreground hover:bg-background-tertiary/80 cursor-pointer flex flex-row gap-1 items-center justify-center">
                        <ArrowLeftIcon size={16} className="shrink-0" />
                        <span className="truncate">Back to Chat</span>
                    </button>
                </div>
            </aside>
            <main className="flex h-full w-full flex-1 items-center justify-center overflow-y-auto bg-background">
                <div className="w-full">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default Settings
