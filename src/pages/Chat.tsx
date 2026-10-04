import { useMutation, usePaginatedQuery, useQuery, useTether } from '@tetherdb/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useInView } from 'react-intersection-observer'

function isYesterdayOrOlder(date: Date) {
  const d = new Date(date);
  const today = new Date();

  // Set both dates to midnight for accurate comparisons
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  // If d is before today, it's yesterday or older
  return d.getTime() < today.getTime();
}

function MessageBox({ channel, onSendMessage }: { channel: any, onSendMessage: (message: string) => void }) {
  const [message, setMessage] = useState('')
  const sendMessageMutation = useMutation('sendMessage')
  const sendMessage = async () => {
    await sendMessageMutation.mutate({ channelID: channel.ID, message: message })
    onSendMessage(message)
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

function MessageItem({ message, user, compact }: { message: any, user: any, compact: boolean }) {
  const tether = useTether()
  let time = new Date(message.CreatedAt).toLocaleTimeString();
  if (isYesterdayOrOlder(new Date(message.CreatedAt))) {
    time = new Date(message.CreatedAt).toLocaleDateString("en-US", { month: 'numeric', day: 'numeric', year: '2-digit' }) + ', ' + new Date(message.CreatedAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
  } else {
    time = new Date(message.CreatedAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
  }
  return (
    <div className={`flex flex-row items-center justify-start w-full px-2 gap-2 ${compact ? '' : 'mt-4'}`}>
      {!compact && <img src={tether.url.replace('/tether', '') + '/' + user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full" />}
      {compact && <div className="w-8 h-6 rounded-full bg-background" />}
      <div className="flex flex-col items-start justify-start">
        {!compact && <p className="text-sm text-foreground-muted">{user.username} • {time}</p>}
        <p>{message.Content}</p>
      </div>
    </div>
  )
}

export default function Chat() {
  const { channelId } = useParams()
  const { data: channel, error: channelError } = useQuery('getChannel', { channelID: channelId })
  const { data: messages, error: messagesError, loadMore: loadMoreMessages, hasMore: hasMoreMessages } = usePaginatedQuery('getMessages', { channelID: channelId })
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const { ref, inView } = useInView({
    threshold: 0.1,
  });

  useEffect(() => {
    if (inView && hasMoreMessages) {
      shouldScrollRef.current = false;
      loadMoreMessages();
    }
  }, [inView, hasMoreMessages]);

  // Layout state from the previous render, used to detect older messages being prepended.
  const lastScrollHeightRef = useRef(0);
  const lastOldestIdRef = useRef<string | null>(null);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    shouldScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    lastScrollHeightRef.current = el.scrollHeight;
  }

  const setScrollToBottom = () => {
    shouldScrollRef.current = true;
  }

  // `messages` is ordered newest -> oldest, so the last entry is the oldest.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !messages) return;

    const oldest = messages.length > 0 ? messages[messages.length - 1] : null;
    const oldestId: string | null = oldest ? oldest.message.ID : null;
    const prevOldestId = lastOldestIdRef.current;

    // History was prepended if the previous oldest message is still present
    // but is no longer the oldest one.
    const prepended =
      prevOldestId !== null &&
      oldestId !== prevOldestId &&
      messages.some((m: any) => m.message.ID === prevOldestId);

    if (prepended) {
      // Keep the viewport on the same content by offsetting the added height.
      const delta = el.scrollHeight - lastScrollHeightRef.current;
      if (delta > 0) {
        el.scrollTop += delta;
      }
    } else if (shouldScrollRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }

    lastOldestIdRef.current = oldestId;
    lastScrollHeightRef.current = el.scrollHeight;
  }, [messages, !!channel]);

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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background">
      <div className="message-scroll flex min-h-0 w-full flex-1 flex-col overflow-y-auto [overflow-anchor:none]" onScroll={handleScroll} ref={containerRef}>
        <div className="mt-auto flex w-full flex-col">
          {hasMoreMessages && <div ref={ref} className="h-[1px]"></div>}
          {messages?.slice().reverse().map((message: any, index: number) => {
            const prevItem = messages.slice().reverse()[index - 1];

            const isSameAuthor = prevItem?.user.id === message.user.id;
            const currentTime = new Date(message.message.CreatedAt).getTime();
            const prevTime = new Date(prevItem?.message.CreatedAt).getTime();
            const isWithinWindow = currentTime - prevTime <= 1000 * 60 * 5;

            const isCompact = isSameAuthor && isWithinWindow;
            return (
              <MessageItem key={message.message.ID} message={message.message} user={message.user} compact={isCompact} />
            )
          })}
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-row items-center justify-start p-2">
        <MessageBox channel={channel} onSendMessage={setScrollToBottom} />
      </div>
    </div>
  )
}