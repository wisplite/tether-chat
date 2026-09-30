import { useQuery, useMutation } from '@tetherdb/react'
import { Outlet } from 'react-router'
import { CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
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
    return (
        <div className="flex flex-row items-center justify-start gap-2 bg-foreground" key={channel.ID}>
            <p className="text-sm font-bold text-foreground-muted">{channel.Name}</p>
        </div>
    )
}

export default function ChatSidebars() {
  const { data: channels } = useQuery('getChannels')
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
            {channels?.map((channel: any) => (
                <ChannelItem key={channel.ID} channel={channel} />
            ))}
        </div>
        <div className="flex flex-col items-center justify-center h-screen flex-1 bg-background">
        <Outlet />
        </div>
        <div className="flex flex-col items-center justify-center h-screen w-1/6 bg-background-secondary">
            <h2 className="text-2xl font-bold">Users</h2>
        </div>
    </div>
  )
}