import { useQuery, useMutation, useTether } from '@tetherdb/react'
import { Link, Outlet, useNavigate, useParams } from 'react-router'
import { CaretRightIcon, PlusIcon, GearIcon, HashIcon, LockSimpleIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import ChatModal from './ChatModal'
import { ProfileButton, ProfileCard } from './ProfileCard'

const CHANNEL_MIN = 144
const CHANNEL_MAX = 400
const CHANNEL_DEFAULT = 200
const NARROW_CHANNEL_DEFAULT = 144
const MEMBERS_MIN = 160
const MEMBERS_MAX = 400
const MEMBERS_DEFAULT = 200
// Leave the message column wide enough that the composer and messages stay usable.
const MAIN_MIN = 320
const NARROW_LAYOUT = 640
const MEMBERS_LAYOUT = 1024
const STORAGE_KEY = 'tether-sidebar-widths'

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

function fitSidebar(preferred: number, min: number, max: number, container: number, reserved: number) {
    const upper = Math.min(max, Math.max(min, container - reserved))
    return Math.round(clamp(preferred, min, upper))
}

function readStoredWidths(): { channels: number | null, members: number | null } {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        return {
            channels: Number.isFinite(value.channels) ? value.channels : null,
            members: Number.isFinite(value.members) ? value.members : null,
        }
    } catch {
        return { channels: null, members: null }
    }
}

function persistWidths(channels: number | null, members: number | null) {
    try {
        const stored: { channels?: number, members?: number } = {}
        if (channels !== null) stored.channels = channels
        if (members !== null) stored.members = members
        if (stored.channels === undefined && stored.members === undefined) {
            localStorage.removeItem(STORAGE_KEY)
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
        }
    } catch {
        // Storage can be unavailable in private mode.
    }
}

function SidebarResizeHandle({
    label,
    value,
    min,
    max,
    direction,
    onChange,
    onReset,
}: {
    label: string
    value: number
    min: number
    max: number
    direction: 1 | -1
    onChange: (width: number) => void
    onReset: () => void
}) {
    const [dragging, setDragging] = useState(false)
    const onChangeRef = useRef(onChange)
    const valueRef = useRef(value)
    useEffect(() => {
        onChangeRef.current = onChange
        valueRef.current = value
    }, [onChange, value])

    useEffect(() => {
        if (!dragging) return
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        return () => {
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
        }
    }, [dragging])

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        if (event.detail > 1) {
            event.preventDefault()
            onReset()
            return
        }
        event.preventDefault()
        const handle = event.currentTarget
        handle.focus()
        const pointerId = event.pointerId
        const startX = event.clientX
        const startWidth = valueRef.current
        handle.setPointerCapture(pointerId)
        setDragging(true)
        const onMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== pointerId) return
            onChangeRef.current(startWidth + (moveEvent.clientX - startX) * direction)
        }
        const onUp = (upEvent: PointerEvent) => {
            if (upEvent.pointerId !== pointerId) return
            handle.removeEventListener('pointermove', onMove)
            handle.removeEventListener('pointerup', onUp)
            handle.removeEventListener('pointercancel', onUp)
            setDragging(false)
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
        handle.addEventListener('pointercancel', onUp)
    }

    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Home') {
            event.preventDefault()
            onChange(min)
            return
        }
        if (event.key === 'End') {
            event.preventDefault()
            onChange(max)
            return
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const step = event.shiftKey ? 32 : 16
        const delta = event.key === 'ArrowRight' ? step : -step
        onChange(value + delta * direction)
    }

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={`${value} pixels`}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            className="group relative z-20 -mx-1.5 w-3 shrink-0 cursor-col-resize touch-none outline-none"
        >
            <div className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${dragging ? 'bg-brand-primary' : 'bg-transparent group-hover:bg-brand-primary group-focus-visible:bg-brand-primary'}`} />
        </div>
    )
}

function CreateChannel({ onClose }: { onClose: () => void }) {
    const [channelName, setChannelName] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)
    const createChannelMutation = useMutation('createChannel')
    const createChannel = async () => {
        const result = await createChannelMutation.mutate({
            name: channelName,
            isPrivate: isPrivate
        })
        if (result.channel) {
            onClose()
        } else {
            console.error(result.error)
        }
    }
    return (
        <div className="flex w-full flex-col items-start gap-4">
            <input aria-label="Channel name" className="w-full rounded-[2px] border border-background-tertiary bg-background px-3 py-2.5 text-sm outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="text" placeholder="Channel name" id="channelName" value={channelName} onChange={(e) => setChannelName(e.target.value)} />
            <div className="flex flex-row items-center justify-start gap-2">
                <label htmlFor="isPrivate" className="text-[13px] font-medium text-foreground">Private channel</label>
                <input className="size-4 accent-brand-primary" type="checkbox" id="isPrivate" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            </div>
            <button className="inline-flex items-center justify-center bg-brand-primary text-white px-4 py-2 rounded-[2px] text-[13px] leading-5 font-medium cursor-pointer transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={createChannel}>Create</button>
        </div>
    )
}

function ChannelItem({ channel }: { channel: any }) {
    const { channelId } = useParams()
    const { prefetch } = useTether()
    const [channelName, setChannelName] = useState(channel.Name)
    const [isPrivate, setIsPrivate] = useState(channel.IsPrivate)
    const [channelSettingsModalOpen, setChannelSettingsModalOpen] = useState(false)
    const updateChannelMutation = useMutation('updateChannel')
    const deleteChannelMutation = useMutation('deleteChannel')
    const handleMouseEnter = async () => {
        const { ready } = prefetch('getMessages', { channelID: channel.ID, StartCursor: null, EndCursor: null })
        const data = await ready;
        prefetch('getMessages', { channelID: channel.ID, StartCursor: data.StartCursor, EndCursor: data.EndCursor })
        prefetch('getChannelMembers', { channelID: channel.ID })
        prefetch('getChannel', { channelID: channel.ID })
    }
    const updateChannel = async () => {
        const result = await updateChannelMutation.mutate({
            channelID: channel.ID,
            channelName: channelName,
            isPrivate: isPrivate
        })
        if (result && !result.error) {
            setChannelSettingsModalOpen(false)
        } else {
            console.error(result.error)
        }
    }
    const deleteChannel = async () => {
        const result = await deleteChannelMutation.mutate({
            channelID: channel.ID
        })
        if (result && !result.error) {
            setChannelSettingsModalOpen(false)
        }
    }
    return (
        <div className="group relative w-full" key={channel.ID} onMouseEnter={handleMouseEnter}>
            <Link to={`/chat/${channel.ID}`} aria-current={channelId === channel.ID ? 'page' : undefined} className={`flex min-h-8 w-full items-center gap-1.5 rounded-[2px] p-1.5 pr-9 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-primary ${channelId === channel.ID ? 'bg-accent-light text-foreground' : 'text-foreground-muted hover:bg-foreground-muted-hover hover:text-foreground'}`}>
                {channel.IsPrivate ? <LockSimpleIcon size={16} className="shrink-0 text-foreground-muted" /> : <HashIcon size={16} className={`shrink-0 ${channelId === channel.ID ? 'text-accent' : 'text-foreground-muted'}`} />}
                <span className="truncate">{channel.Name}</span>
            </Link>
            <button aria-label={`Settings for ${channel.Name}`} className="absolute right-1 top-0.5 flex size-7 cursor-pointer items-center justify-center rounded-[2px] text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={() => setChannelSettingsModalOpen(true)}><GearIcon size={16} /></button>
            <ChatModal title="Channel Settings" open={channelSettingsModalOpen} onClose={() => setChannelSettingsModalOpen(false)} children={
                <div className="flex w-full flex-col items-start gap-4">
                    <p className="text-[13px] font-medium text-foreground">Channel Name</p>
                    <input aria-label="Channel name" className="w-full rounded-[2px] border border-background-tertiary bg-background px-3 py-2.5 text-sm outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="text" placeholder="Channel name" id="channelName" value={channelName} onChange={(e) => setChannelName(e.target.value)} />
                    <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                        <input className="size-4 accent-brand-primary" type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                        Private channel
                    </label>
                    <div className="flex flex-row items-center justify-between gap-2 w-full">
                        <button className="inline-flex items-center justify-center bg-brand-primary text-white px-4 py-2 rounded-[2px] text-[13px] leading-5 font-medium cursor-pointer transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={updateChannel}>Update</button>
                        <button className="rounded-[2px] border border-error/20 bg-error/5 px-4 py-2 text-[13px] leading-5 font-medium text-error cursor-pointer hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-error" onClick={deleteChannel}>Delete</button>
                    </div>
                </div>
            } />
        </div>
    )
}

function UserItem({ user }: { user: any }) {
    const tether = useTether()
    return (
        <ProfileCard
            userId={user.ID}
            preview={{
                username: user.Username,
                nickname: user.Nickname,
                avatarUrl: user.AvatarUrl,
                role: user.Role,
                status: user.Status,
                presence: user.Presence,
                profileColor: user.ProfileColor,
            }}
        >
            <ProfileButton className="flex min-w-0 w-full cursor-pointer items-center gap-3 rounded-[2px] p-1.5 text-left hover:bg-foreground-muted-hover focus-visible:outline-2 focus-visible:outline-brand-primary">
                <img src={tether.url.replace('/tether', '') + '/' + user.AvatarUrl} alt="" className="size-7 shrink-0 rounded-[2px] bg-background-tertiary object-cover" />
                <div className="flex flex-col items-start justify-start">
                    <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{user.Nickname}</span>
                    <span className="min-w-0 truncate text-[13px] text-foreground-muted">{user.Status}</span>
                </div>
            </ProfileButton>
        </ProfileCard>
    )
}

export default function ChatSidebars() {
    const { channelId } = useParams()
    const navigate = useNavigate()
    const tether = useTether()
    const { data: channels } = useQuery('getChannels')
    const { data: users } = useQuery('getChannelMembers', { channelID: channelId })
    const { data: userInfo } = useQuery('getUserInfo')
    const [channelListOpen, setChannelListOpen] = useState(true)
    const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false)
    const layoutRef = useRef<HTMLDivElement>(null)
    const [containerWidth, setContainerWidth] = useState(() => window.innerWidth)
    const [membersVisible, setMembersVisible] = useState(() => window.matchMedia(`(min-width: ${MEMBERS_LAYOUT}px)`).matches)
    const [channelPreferred, setChannelPreferred] = useState<number | null>(() => readStoredWidths().channels)
    const [membersPreferred, setMembersPreferred] = useState<number | null>(() => readStoredWidths().members)
    const preferredRef = useRef({ channels: channelPreferred, members: membersPreferred })
    useEffect(() => {
        preferredRef.current = { channels: channelPreferred, members: membersPreferred }
    }, [channelPreferred, membersPreferred])

    useLayoutEffect(() => {
        const layout = layoutRef.current
        if (!layout) return
        const update = () => setContainerWidth(layout.clientWidth)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(layout)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        const media = window.matchMedia(`(min-width: ${MEMBERS_LAYOUT}px)`)
        const update = () => setMembersVisible(media.matches)
        update()
        media.addEventListener('change', update)
        return () => media.removeEventListener('change', update)
    }, [])

    const channelTarget = channelPreferred ?? (containerWidth < NARROW_LAYOUT ? NARROW_CHANNEL_DEFAULT : CHANNEL_DEFAULT)
    const membersTarget = membersPreferred ?? MEMBERS_DEFAULT
    const membersReserve = membersVisible ? MEMBERS_MIN : 0
    const channelWidth = fitSidebar(channelTarget, CHANNEL_MIN, CHANNEL_MAX, containerWidth, MAIN_MIN + membersReserve)
    const membersWidth = membersVisible
        ? fitSidebar(membersTarget, MEMBERS_MIN, MEMBERS_MAX, containerWidth, MAIN_MIN + channelWidth)
        : 0
    const channelMax = Math.min(CHANNEL_MAX, Math.max(CHANNEL_MIN, containerWidth - MAIN_MIN - membersReserve))
    const membersMax = Math.min(MEMBERS_MAX, Math.max(MEMBERS_MIN, containerWidth - MAIN_MIN - channelWidth))

    const setChannelWidth = (requested: number) => {
        const next = fitSidebar(requested, CHANNEL_MIN, CHANNEL_MAX, containerWidth, MAIN_MIN + membersReserve)
        preferredRef.current.channels = next
        setChannelPreferred(next)
        persistWidths(next, preferredRef.current.members)
    }
    const setMembersWidth = (requested: number) => {
        const next = fitSidebar(requested, MEMBERS_MIN, MEMBERS_MAX, containerWidth, MAIN_MIN + channelWidth)
        preferredRef.current.members = next
        setMembersPreferred(next)
        persistWidths(preferredRef.current.channels, next)
    }
    const resetChannelWidth = () => {
        preferredRef.current.channels = null
        setChannelPreferred(null)
        persistWidths(null, preferredRef.current.members)
    }
    const resetMembersWidth = () => {
        preferredRef.current.members = null
        setMembersPreferred(null)
        persistWidths(preferredRef.current.channels, null)
    }
    const toggleChannelListOpen = () => {
        setChannelListOpen(!channelListOpen)
    }
    const toggleCreateChannelModalOpen = () => {
        setCreateChannelModalOpen(!createChannelModalOpen)
    }
    return (
        <div ref={layoutRef} className="flex h-dvh w-full overflow-hidden bg-background">
            <aside aria-label="Channels" style={{ width: channelWidth }} className="flex h-full min-w-0 shrink-0 flex-col border-r border-background-tertiary bg-background-secondary">
                <div className="flex items-center justify-between gap-1 px-3 pb-2 pt-2">
                    <button className="flex min-w-0 pl-1 cursor-pointer items-center gap-1.5 rounded-[2px] text-xs font-medium text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary" onClick={toggleChannelListOpen} aria-expanded={channelListOpen}>
                        <span className="min-w-0 truncate">Channels</span>
                        <CaretRightIcon className={`shrink-0 transition-transform ${channelListOpen ? 'rotate-90' : ''}`} size={12} />
                    </button>
                    {userInfo?.Role === 'admin' && <button aria-label="Create channel" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-foreground-muted hover:bg-background-tertiary hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary" onClick={toggleCreateChannelModalOpen}><PlusIcon size={16} /></button>}
                    {userInfo?.Role !== 'admin' && <div className="size-7 shrink-0" />}
                </div>
                <div className={`min-h-0 flex-1 flex flex-col gap-0.5 justify-between overflow-y-auto px-2 pb-2 ${channelListOpen ? '' : 'hidden'}`}>
                    <div className="flex flex-col gap-0.5">
                        {channels?.map((channel: any) => <ChannelItem key={channel.ID} channel={channel} />)}
                        {channels?.length === 0 && <p className="px-3 py-2 text-xs leading-5 text-foreground-muted">Create a channel to start a conversation.</p>}
                    </div>
                    <div className="flex flex-row items-center gap-1 rounded-[2px] border border-background-tertiary bg-background-tertiary p-1">
                        {userInfo?.ID ? (
                            <ProfileCard
                                userId={userInfo.ID}
                                preview={{
                                    username: userInfo.Username,
                                    nickname: userInfo.Nickname,
                                    avatarUrl: userInfo.AvatarUrl,
                                    role: userInfo.Role,
                                    status: userInfo.Status,
                                    presence: userInfo.Presence,
                                    bio: userInfo.Bio,
                                    profileColor: userInfo.ProfileColor,
                                    createdAt: userInfo.CreatedAt,
                                }}
                            >
                                <ProfileButton label={`View ${userInfo.Username}'s profile`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[2px] px-1 py-1 text-left hover:bg-foreground-muted-hover focus-visible:outline-2 focus-visible:outline-brand-primary">
                                    <img src={tether.url.replace('/tether', '') + '/' + userInfo.AvatarUrl} alt="" className="size-8 shrink-0 rounded-[2px] bg-background object-cover" />
                                    <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{userInfo.Username}</span>
                                </ProfileButton>
                            </ProfileCard>
                        ) : <div className="h-8 flex-1" />}
                        <button className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-foreground-muted hover:bg-foreground-muted-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary" onClick={() => {navigate('/settings')}}><GearIcon size={16} /></button>
                    </div>
                </div>
            </aside>
            <SidebarResizeHandle
                label="Resize channels sidebar"
                value={channelWidth}
                min={CHANNEL_MIN}
                max={channelMax}
                direction={1}
                onChange={setChannelWidth}
                onReset={resetChannelWidth}
            />
            <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
                <Outlet />
            </main>
            {membersVisible && (
                <>
                    <SidebarResizeHandle
                        label="Resize members sidebar"
                        value={membersWidth}
                        min={MEMBERS_MIN}
                        max={membersMax}
                        direction={-1}
                        onChange={setMembersWidth}
                        onReset={resetMembersWidth}
                    />
                    <aside aria-label="Channel members" style={{ width: membersWidth }} className="flex h-full min-w-0 shrink-0 flex-col border-l border-background-tertiary bg-background-secondary">
                        <div className="min-h-0 overflow-y-auto px-2 py-2 gap-2 flex flex-col">
                            {users?.map((user: any) => <UserItem key={user.ID} user={user} />)}
                            {!channelId && <p className="px-3 text-xs leading-5 text-foreground-muted">Select a channel to see its members.</p>}
                        </div>
                    </aside>
                </>
            )}
            <ChatModal title="Create channel" open={createChannelModalOpen} onClose={() => setCreateChannelModalOpen(false)}>
                <CreateChannel onClose={() => setCreateChannelModalOpen(false)} />
            </ChatModal>
        </div>
    )
}
