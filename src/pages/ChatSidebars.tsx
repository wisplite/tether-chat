import { useQuery, useMutation, useTether } from '@tetherdb/react'
import { Link, Outlet, useNavigate, useParams } from 'react-router'
import { CaretRightIcon, PlusIcon, GearIcon, HashIcon, ChatCircleIcon, LockSimpleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import ChatModal from './ChatModal'
import { ProfileButton, ProfileCard } from './ProfileCard'

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
            }}
        >
            <ProfileButton className="flex min-w-0 w-full cursor-pointer items-center gap-3 rounded-[2px] p-1.5 text-left hover:bg-foreground-muted-hover focus-visible:outline-2 focus-visible:outline-brand-primary">
                <img src={tether.url.replace('/tether', '') + '/' + user.AvatarUrl} alt="" className="size-7 shrink-0 rounded-[2px] bg-background-tertiary object-cover" />
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{user.Username}</span>
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
    const toggleChannelListOpen = () => {
        setChannelListOpen(!channelListOpen)
    }
    const toggleCreateChannelModalOpen = () => {
        setCreateChannelModalOpen(!createChannelModalOpen)
    }
    return (
        <div className="flex h-dvh w-full overflow-hidden bg-background">
            <aside aria-label="Channels" className="flex h-full w-36 shrink-0 flex-col border-r border-background-tertiary bg-background-secondary sm:w-[200px]">
                <div className="flex items-center justify-between gap-1 px-3 pb-2 pt-2">
                    <button className="flex min-w-0 pl-1 cursor-pointer items-center gap-1.5 rounded-[2px] text-xs font-medium text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary" onClick={toggleChannelListOpen} aria-expanded={channelListOpen}>
                        <span>Channels</span>
                        <CaretRightIcon className={`shrink-0 transition-transform ${channelListOpen ? 'rotate-90' : ''}`} size={12} />
                    </button>
                    {userInfo?.Role === 'admin' && <button aria-label="Create channel" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-foreground-muted hover:bg-background-tertiary hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary" onClick={toggleCreateChannelModalOpen}><PlusIcon size={16} /></button>}
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
            <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
                <Outlet />
            </main>
            <aside aria-label="Channel members" className="hidden h-full w-[200px] shrink-0 flex-col border-l border-background-tertiary bg-background-secondary lg:flex">
                <div className="min-h-0 overflow-y-auto px-2 py-2 gap-2 flex flex-col">
                    {users?.map((user: any) => <UserItem key={user.ID} user={user} />)}
                    {!channelId && <p className="px-3 text-xs leading-5 text-foreground-muted">Select a channel to see its members.</p>}
                </div>
            </aside>
            <ChatModal title="Create channel" open={createChannelModalOpen} onClose={() => setCreateChannelModalOpen(false)}>
                <CreateChannel onClose={() => setCreateChannelModalOpen(false)} />
            </ChatModal>
        </div>
    )
}
