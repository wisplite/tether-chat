import { useQuery } from '@tetherdb/react'

export default function Chat() {
  const { data: messages } = useQuery('getMessages')
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background">
      <h2 className="text-2xl font-bold">Chat</h2>
      {messages?.map((message: any) => (
        <div key={message.ID}>
          <p>{message.Content}</p>
        </div>
      ))}
    </div>
  )
}