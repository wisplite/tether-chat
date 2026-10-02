import { useQuery, useMutation } from '@tetherdb/react'
import { Outlet, useParams } from 'react-router'
import { CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import ChatModal from './ChatModal'

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
        <div className="flex flex-col items-start justify-start gap-2">
            <input type="text" placeholder="Channel Name" id="channelName" value={channelName} onChange={(e) => setChannelName(e.target.value)} />
            <div className="flex flex-row items-center justify-start gap-2">
                <label htmlFor="isPrivate" className="text-sm font-bold text-foreground-muted">Is Private</label>
                <input type="checkbox" placeholder="Is Private" id="isPrivate" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            </div>
            <button className="bg-brand-primary text-white px-4 py-2 rounded-md cursor-pointer hover:bg-accent" onClick={createChannel}>Create</button>
        </div>
    )
}

function ChannelItem({ channel }: { channel: any }) {
    const navigate = useNavigate()
    const { channelId } = useParams()
    const navigateToChannel = () => {
        navigate(`/chat/${channel.ID}`)
    }
    return (
        <div className={`flex flex-row items-center justify-start w-full rounded-md cursor-pointer ${channelId === channel.ID ? 'bg-foreground-ultra-muted' : 'hover:bg-foreground-muted-hover'}`} key={channel.ID} onClick={navigateToChannel}>
            <p className="text-md font-bold text-foreground-muted p-1"># {channel.Name}</p>
        </div>
    )
}

function UserItem({ user }: { user: any }) {
    return (
        <div className="flex flex-row items-center justify-start w-full rounded-md cursor-pointer" key={user.ID}>
            <p className="text-md font-bold text-foreground-muted p-1">{user.Username}</p>
        </div>
    )
}

export default function ChatSidebars() {
    const { channelId } = useParams()
    const { data: channels } = useQuery('getChannels')
    const { data: users } = useQuery('getChannelMembers', { channelID: channelId })
    const [channelListOpen, setChannelListOpen] = useState(true)
    const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false)
    const toggleChannelListOpen = () => {
        setChannelListOpen(!channelListOpen)
    }
    const toggleCreateChannelModalOpen = () => {
        setCreateChannelModalOpen(!createChannelModalOpen)
    }
    return (
        <div className="flex flex-row items-center justify-center h-screen bg-background">
            <div className="flex flex-col items-start justify-start h-screen w-1/5 bg-background-secondary p-2">
                <h2 className="text-lg text-center font-bold text-foreground-muted border-b border-foreground-ultra-muted pb-2 w-full">Channels</h2>
                <div className="flex flex-row items-center justify-between gap-2 w-full mt-4">
                    <div className="flex flex-row items-center justify-center gap-2 cursor-pointer" onClick={toggleChannelListOpen}>
                        <p className="text-sm font-bold text-foreground-muted">Text Channels</p>
                        <CaretRightIcon className={`text-foreground-muted transition-transform duration-300 ${channelListOpen ? 'rotate-90' : 'rotate-0'}`} size={16} />
                    </div>
                    <button className="text-sm font-bold text-foreground-muted cursor-pointer" onClick={toggleCreateChannelModalOpen}><PlusIcon size={16} /></button>
                    <ChatModal title="Create Channel" open={createChannelModalOpen} onClose={() => setCreateChannelModalOpen(false)} children={
                        <CreateChannel onClose={() => setCreateChannelModalOpen(false)} />
                    } />
                </div>
                <div className={`flex flex-col items-start justify-start gap-2 w-full pt-2 ${channelListOpen ? '' : 'hidden'}`}>
                {channels?.map((channel: any) => (
                        <ChannelItem key={channel.ID} channel={channel} />
                    ))}
                </div>
            </div>
            <div className="flex flex-col items-center justify-center h-screen flex-1 bg-background">
            <Outlet />
            </div>
            <div className="flex flex-col items-start justify-start h-screen w-1/5 bg-background-secondary p-2">
                <h2 className="text-lg text-center font-bold text-foreground-muted border-b border-foreground-ultra-muted pb-2 w-full">Users</h2>
                <div className="flex flex-col items-start justify-start gap-2 w-full pt-2">
                    {users?.map((user: any) => (
                        <UserItem key={user.ID} user={user} />
                    ))}
                </div>
            </div>
        </div>
    )
}