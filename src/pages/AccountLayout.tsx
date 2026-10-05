import type { ReactNode } from 'react'
import { ChatCircleIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'

export default function AccountLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center border-b border-background-tertiary bg-background-secondary px-6">
        <Link to="/" className="flex items-center gap-2.5 rounded-[2px] text-base font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary">
          <ChatCircleIcon size={22} weight="fill" className="text-brand-primary" />
          Tether <span className="border-l border-background-tertiary pl-2.5 text-[13px] font-normal tracking-normal text-foreground-muted">Chat</span>
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <section className="w-full max-w-sm">
          <p className="mb-2 text-[13px] font-medium text-foreground-muted">Your workspace, connected</p>
          <h1 className="text-[32px] font-bold leading-9 tracking-[-0.03em]">{title}</h1>
          <p className="mt-3 text-[13px] leading-5 text-foreground-muted">{description}</p>
          <div className="mt-6 border-t border-background-tertiary pt-6">{children}</div>
        </section>
      </div>
      <footer className="px-6 py-4 font-mono text-[11px] text-foreground-muted">Tether Chat</footer>
    </main>
  )
}
