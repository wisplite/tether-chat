import { useState } from 'react'
import { useMutation, useQuery } from '@tetherdb/react'

type Invitee = { ID: string, Username: string, Nickname: string }

export default function ChannelInvitations({ channelID }: { channelID: string }) {
    const { data, error: loadError } = useQuery('getChannelInvitees', { channelID })
    const invite = useMutation('inviteToChannel')
    const [search, setSearch] = useState('')
    const [pending, setPending] = useState<string | null>(null)
    const [invited, setInvited] = useState<string[]>([])
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const available = (Array.isArray(data) ? data as Invitee[] : []).filter(user => !invited.includes(user.ID))
    const query = search.trim().toLocaleLowerCase()
    const users = available.filter(user => `${user.Nickname} ${user.Username}`.toLocaleLowerCase().includes(query))

    const inviteUser = async (user: Invitee) => {
        if (pending) return
        setPending(user.ID)
        setError('')
        setNotice('')
        try {
            const result = await invite.mutate({ channelID, userID: user.ID })
            if (!result?.success) throw new Error('Invitation failed')
            setInvited(previous => [...previous, user.ID])
            setNotice(`${user.Nickname || user.Username} now has access to this channel.`)
        } catch {
            setError('Unable to invite this person. Please try again.')
        } finally {
            setPending(null)
        }
    }

    return <section className="flex w-full flex-col gap-3 border-t border-background-tertiary pt-4" aria-label="Invite people">
        <h3 className="text-sm font-semibold">Invite people</h3>
        <p className="text-[13px] text-foreground-muted">Invited people can immediately read and send messages. Admins already have access.</p>
        <input type="search" aria-label="Search people to invite" placeholder="Search by name or username" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-[2px] border border-background-tertiary bg-background px-3 py-2 text-sm outline-none focus:border-brand-primary" />
        {loadError ? <p role="alert" className="text-[13px] text-error">Unable to load people. Close and reopen settings to retry.</p>
            : !data ? <p role="status" className="text-[13px] text-foreground-muted">Loading people…</p>
            : <ul className="max-h-48 overflow-y-auto">
                {users.map(user => <li key={user.ID} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0 text-sm"><p className="truncate font-medium">{user.Nickname || user.Username}</p><p className="truncate text-xs text-foreground-muted">@{user.Username}</p></div>
                    <button type="button" disabled={pending !== null} onClick={() => inviteUser(user)} aria-label={`Invite ${user.Username}`} className="shrink-0 rounded-[2px] bg-brand-primary px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent focus-visible:outline-2 focus-visible:outline-brand-primary disabled:opacity-50">{pending === user.ID ? 'Inviting…' : 'Invite'}</button>
                </li>)}
                {users.length === 0 && <li className="text-[13px] text-foreground-muted">{available.length === 0 ? 'Everyone already has access.' : 'No matching people.'}</li>}
            </ul>}
        {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
        {notice && <p role="status" className="text-[13px] text-foreground-muted">{notice}</p>}
    </section>
}
