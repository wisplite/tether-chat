import { useMutation, usePaginatedQuery, useQuery, useTether } from '@tetherdb/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useInView } from 'react-intersection-observer'
import { PlusIcon, FileIcon, TrashIcon, PencilIcon } from '@phosphor-icons/react'

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
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const tether = useTether()
  const sendMessageMutation = useMutation('sendMessage')
  const uploadFileMutation = useMutation('uploadFile')
  const sendMessage = async () => {
    const attachments = []
    if (files.length > 0) {
      setUploading(true)
      for (const file of files) {
        const uploadData = await uploadFileMutation.mutate({ channelID: channel.ID })
        if (uploadData.uploadURL) {
          const response = await fetch(tether.url.replace('/tether', '') + uploadData.uploadURL, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': file.type,
            },
          })
          if (response.ok) {
            attachments.push(uploadData.fileID)
          }
        }
      }
      setUploading(false)
    }
    // Set this before the mutation so the scroll effect sees it on the
    // invalidation render, which can flush before mutate() resolves.
    onSendMessage(message)
    await sendMessageMutation.mutate({ channelID: channel.ID, message: message, attachments: attachments })
    setMessage('')
    setFiles([])
  }
  const openFilePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e) => {
      const selected = (e.target as HTMLInputElement).files
      if (selected) {
        setFiles((prev) => [...prev, ...Array.from(selected)])
      }
    }
    input.click()
  }
  return (
    <div className="flex flex-col items-center justify-start rounded-md w-full bg-background-secondary p-2 gap-2">
      {files.length > 0 && (
        <div className="flex flex-row items-center justify-start gap-2 w-full">
          {files.map((file) => {
            return <div key={file.name} className="flex flex-row items-center justify-start gap-2 w-24 h-24 relative">
              <button className="w-8 h-8 rounded-md bg-background-secondary hover:bg-background-tertiary absolute top-0 right-0 flex items-center justify-center cursor-pointer" onClick={() => {
                setFiles((prev) => prev.filter((f) => f.name !== file.name))
              }}>
                <TrashIcon className="w-4 h-4 text-error" />
              </button>
              {file.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover rounded-md" />
              ) : (
                <FileIcon className="w-full h-full text-foreground-muted" />
              )}
            </div>
          })}
        </div>
      )}
      <div className="flex flex-row items-center justify-start gap-2 w-full">
        <button className="w-8 h-8 rounded-md bg-background-secondary hover:bg-foreground-muted-hover flex items-center justify-center cursor-pointer" disabled={uploading} onClick={openFilePicker}>
          <PlusIcon className="w-6 h-6 text-foreground-muted" />
        </button>
        <input type="text" placeholder={`Message #${channel.Name}`} className="w-full bg-transparent outline-none" disabled={uploading} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter') {
            sendMessage()
          }
        }}/>
      </div>
    </div>
  )
}

function AttachmentItem({ attachment }: { attachment: string }) {
  const tether = useTether()
  const [contentType, setContentType] = useState<string | null>(null)
  async function fetchAttachment() {
    const response = await fetch(tether.url.replace('/tether', '') + attachment)
    if (!response.ok) {
      await response.body?.cancel()
      setContentType('')
      return null
    }
    
    setContentType(response.headers.get('content-type') ?? '')
    await response.body?.cancel()
  }
  useEffect(() => {
    fetchAttachment()
  }, [attachment])
  const src = tether.url.replace('/tether', '') + attachment
  if (contentType?.startsWith('image/')) {
    return <img src={src} alt={attachment} className="block h-64 object-cover rounded-md" />
  } else if (contentType?.startsWith('video/')) {
    return <div className="basis-full">
      <video src={src} className="block h-auto w-auto max-h-64 max-w-full rounded-md" controls />
    </div>
  } else if (contentType?.startsWith('audio/')) {
    return <div className="basis-full">
      <audio src={src} className="block w-full" controls />
    </div>
  } else if (contentType === null) {
    return <div className="w-32 h-32 rounded-md bg-background" />
  } else {
    return <div className="flex items-center justify-center w-32 h-32">
      <FileIcon className="w-full h-full text-foreground-muted" />
    </div>
  }
}

function MessageItem({ message, user, compact }: { message: any, user: any, compact: boolean }) {
  const tether = useTether()
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const deleteMessageMutation = useMutation('deleteMessage')
  const editMessageMutation = useMutation('editMessage')
  const [messageContent, setMessageContent] = useState(message.Content)
  let time = new Date(message.CreatedAt).toLocaleTimeString();
  if (isYesterdayOrOlder(new Date(message.CreatedAt))) {
    time = new Date(message.CreatedAt).toLocaleDateString("en-US", { month: 'numeric', day: 'numeric', year: '2-digit' }) + ', ' + new Date(message.CreatedAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
  } else {
    time = new Date(message.CreatedAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
  }
  return (
    <div className={`relative flex flex-row items-start justify-start hover:bg-foreground-ultra-muted w-full px-2 gap-2 ${compact ? '' : 'mt-4'}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {!compact && (
        <div className="h-11 shrink-0 flex items-center">
          <img src={tether.url.replace('/tether', '') + user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full" />
        </div>
      )}
      {compact && <div className="w-8 h-6 shrink-0 rounded-full bg-transparent" />}
      <div className="flex flex-col items-start justify-start min-w-0 flex-1">
        {!compact && <p className="text-sm text-foreground-muted">{user.username} • {time}</p>}
        {isEditing ? (
          <input type="text" className="max-w-full wrap-break-word bg-transparent outline-none w-full" autoFocus value={messageContent} onChange={(e) => setMessageContent(e.target.value)} onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              const response = await editMessageMutation.mutate({ messageID: message.ID, message: messageContent })
              if (response.error) {
                console.error(response.error)
              }
              setIsEditing(false)
            }
          }} />
        ) : (
          <p className="max-w-full wrap-break-word">{message.Content}</p>
        )}
        {message.Attachments.length > 0 && (
          <div className="flex flex-row flex-wrap items-start justify-start gap-2 w-full mt-1">
            {message.Attachments.map((attachment: string, index: number) => (
              <AttachmentItem key={`${message.ID}:${index}`} attachment={attachment} />
            ))}
          </div>
        )}
      </div>
      {isHovered && !isEditing && <div className="absolute -top-4 right-1 flex flex-row items-center justify-center rounded-md bg-background-secondary p-1 gap-2">
        <button className="text-sm font-bold text-foreground-muted cursor-pointer hover:bg-foreground-muted-hover w-6 h-6 aspect-square flex items-center justify-center rounded-md transform transition-transform duration-300 hover:scale-110" onClick={() => {setIsEditing(!isEditing)}}><PencilIcon size={16} /></button>
        <button className="text-sm font-bold text-error cursor-pointer hover:bg-foreground-muted-hover w-6 h-6 aspect-square flex items-center justify-center rounded-md transform transition-transform duration-300 hover:scale-110" onClick={() => {deleteMessageMutation.mutate({ messageID: message.ID })}}><TrashIcon size={16} /></button>
      </div>}
    </div>
  )
}

export default function Chat() {
  const { channelId } = useParams()
  const { data: channel, error: channelError } = useQuery('getChannel', { channelID: channelId })
  const { data: messages, error: messagesError, loadMore: loadMoreMessages, hasMore: hasMoreMessages } = usePaginatedQuery('getMessages', { channelID: channelId })
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);
  const ignoreProgrammaticScrollRef = useRef(false);

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
    if (!el || ignoreProgrammaticScrollRef.current) return;
    const threshold = 100;
    shouldScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    lastScrollHeightRef.current = el.scrollHeight;
  }

  const pinToBottom = () => {
    const el = containerRef.current;
    if (!el || !shouldScrollRef.current) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll - el.scrollTop <= 1) return;
    ignoreProgrammaticScrollRef.current = true;
    el.scrollTop = maxScroll;
    ignoreProgrammaticScrollRef.current = false;
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
        ignoreProgrammaticScrollRef.current = true;
        el.scrollTop += delta;
        ignoreProgrammaticScrollRef.current = false;
      }
    } else {
      pinToBottom();
    }

    lastOldestIdRef.current = oldestId;
    lastScrollHeightRef.current = el.scrollHeight;
  }, [messages, !!channel]);

  // Attachment resolution and the composer shrinking both change height after
  // the messages effect has already scrolled. Stay pinned when that happens.
  useLayoutEffect(() => {
    const el = containerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const observer = new ResizeObserver(() => {
      pinToBottom();
      lastScrollHeightRef.current = el.scrollHeight;
    });
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [channelId, !!channel]);

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
        <div className="mt-auto flex w-full flex-col" ref={contentRef}>
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