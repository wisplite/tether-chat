import { useMutation, useQuery } from '@tetherdb/react'
import { useState } from 'react'
import { useParams } from 'react-router'

function MessageBox({ channel }: { channel: any }) {
  const [message, setMessage] = useState('')
  const sendMessageMutation = useMutation('sendMessage')
  const sendMessage = async () => {
    await sendMessageMutation.mutate({ channelID: channel.ID, message: message })
    setMessage('')
  }
  return (
    <div className="flex flex-row items-center justify-start rounded-md w-full bg-background-secondary p-2">
      <input type="text" placeholder={`Message #${channel.Name}`} className="w-full bg-transparent outline-none" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => {
        if (e.key === 'Enter') {
          sendMessage()
        }
      }}/>
    </div>
  )
}

function MessageItem({ message, user }: { message: any, user: any }) {
  return (
    <div className="flex flex-row items-center justify-start w-full p-2 gap-2">
      <img src={user.avatarUrl} alt={user.username} className="w-6 h-6 rounded-full" />
      <div className="flex flex-col items-start justify-start gap-1">
        <p className="text-sm text-foreground-muted">{user.username}</p>
        <p>{message.Content}</p>
      </div>
    </div>
  )
}

export default function Chat() {
  const { channelId } = useParams()
  const { data: messages } = useQuery('getMessages', { channelID: channelId })
  const { data: channel, error: channelError } = useQuery('getChannel', { channelID: channelId })
  if (channelError) {
    return <div>Error: {channelError.message}</div>
  }
  if (!channelId) {
    return <div>No channel selected</div>
  }
  if (!channel) {
    return <div></div>
  }
  return (
    <div className="flex flex-col items-center justify-center w-full h-screen bg-background">
      <div className="flex flex-col items-center justify-end w-full h-full">
        {messages?.map((message: any) => (
          <MessageItem key={message.message.ID} message={message.message} user={message.user} />
        ))}
      </div>
      <div className="flex flex-row items-center justify-start w-full p-2">
        <MessageBox channel={channel} />
      </div>
    </div>
  )
}