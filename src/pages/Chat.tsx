import { useMutation, usePaginatedQuery, useQuery, useTether } from '@tetherdb/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useInView } from 'react-intersection-observer'
import { PlusIcon, FileIcon, TrashIcon, PencilIcon, DownloadIcon } from '@phosphor-icons/react'

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, index)).toFixed(2) + ' ' + units[index]
}

function isYesterdayOrOlder(date: Date) {
  const d = new Date(date);
  const today = new Date();

  // Set both dates to midnight for accurate comparisons
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  // If d is before today, it's yesterday or older
  return d.getTime() < today.getTime();
}

type PendingFile = {
  id: string
  file: File
  previewUrl: string | null
}

function releaseFiles(items: PendingFile[]) {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
}

function putFile(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<boolean>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    let lastPercent = -1
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100))
      if (percent === lastPercent) return
      lastPercent = percent
      onProgress(percent)
    }
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => reject(new Error('upload failed'))
    xhr.send(file)
  })
}

function downloadWithProgress(src: string, filename: string, onProgress: (percent: number) => void) {
  return (async () => {
    const res = await fetch(src)
    if (!res.ok || !res.body) {
      await res.body?.cancel()
      throw new Error('download failed')
    }
    const total = Number(res.headers.get('Content-Length'))
    const computable = Number.isFinite(total) && total > 0
    onProgress(computable ? 0 : -1)
    const reader = res.body.getReader()
    const chunks: ArrayBuffer[] = []
    let loaded = 0
    let lastPercent = -1
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
        loaded += value.byteLength
        if (!computable) continue
        const percent = Math.min(100, Math.round((loaded / total) * 100))
        if (percent === lastPercent) continue
        lastPercent = percent
        onProgress(percent)
      }
    } catch (error) {
      await reader.cancel()
      throw error
    }
    const type = res.headers.get('Content-Type') ?? ''
    const blob = new Blob(chunks, type ? { type } : undefined)
    const objectURL = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectURL
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    // click() only starts the save; revoking immediately can drop the file.
    setTimeout(() => URL.revokeObjectURL(objectURL), 1500)
  })()
}

type HoverProps = { onMouseEnter?: () => void, onMouseLeave?: () => void }

function FileAttachment({ src, filename, size, onMouseEnter, onMouseLeave }: { src: string, filename: string, size: number } & HoverProps) {
  const [progress, setProgress] = useState<number | null>(null)
  const downloadingRef = useRef(false)
  const downloading = progress !== null
  const indeterminate = progress !== null && progress < 0
  const download = async () => {
    if (downloadingRef.current) return
    downloadingRef.current = true
    setProgress(-1)
    try {
      await downloadWithProgress(src, filename, setProgress)
    } catch (error) {
      console.error(error)
    } finally {
      downloadingRef.current = false
      setProgress(null)
    }
  }
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="basis-1/2 relative flex items-center justify-between gap-2 overflow-hidden rounded-md bg-background-secondary p-2 mb-1">
      <div className="flex flex-col items-start justify-start gap-2">
        <p className="min-w-0 truncate text-sm text-foreground-muted">{filename}</p>
        <p className="text-xs text-foreground-muted">{size ? formatBytes(size) : ''}</p>
      </div>
      <button
        type="button"
        className="inline-flex w-10 h-10 shrink-0 cursor-pointer items-center justify-center text-foreground-muted hover:bg-foreground-muted-hover rounded-md disabled:cursor-progress"
        onClick={download}
        disabled={downloading}
        aria-label={downloading ? `Downloading ${filename}` : `Download ${filename}`}
      >
        {downloading && !indeterminate ? (
          <span className="text-sm tabular-nums">{progress}%</span>
        ) : (
          <DownloadIcon className="h-6 w-6" />
        )}
      </button>
      {downloading && (
        <div
          className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-foreground-muted/15"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : progress ?? 0}
          aria-valuetext={indeterminate ? 'Downloading' : `${progress}%`}
          aria-label={`Downloading ${filename}`}
        >
          <div
            className={`h-full bg-accent ${indeterminate ? 'w-1/3 animate-[download-indeterminate_1s_ease-in-out_infinite]' : ''}`}
            style={indeterminate ? undefined : { width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

function UploadProgress({ percent }: { percent: number }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/50"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Uploading, ${percent}%`}
    >
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} fill="none" className="stroke-white/30" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          className="stroke-white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="text-xs text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{percent}%</span>
    </div>
  )
}

function MessageBox({ channel, onSendMessage }: { channel: any, onSendMessage: (message: string) => void }) {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tether = useTether()
  const sendMessageMutation = useMutation('sendMessage')
  const uploadFileMutation = useMutation('uploadFile')
  const removeFile = (id: string) => {
    setFiles((prev) => {
      releaseFiles(prev.filter((item) => item.id === id))
      return prev.filter((item) => item.id !== id)
    })
  }
  const sendMessage = async () => {
    const attachments = []
    try {
      if (files.length > 0) {
        setUploading(true)
        setUploadProgress(Object.fromEntries(files.map((item) => [item.id, 0])))
        for (const item of files) {
          const uploadData = await uploadFileMutation.mutate({ channelID: channel.ID })
          if (uploadData.uploadURL) {
            const ok = await putFile(
              tether.url.replace('/tether', '') + uploadData.uploadURL,
              item.file,
              (percent) => setUploadProgress((prev) => ({ ...prev, [item.id]: percent })),
            )
            if (ok) {
              attachments.push({id: uploadData.fileID, filename: item.file.name})
            }
          }
        }
      }
      // Set this before the mutation so the scroll effect sees it on the
      // invalidation render, which can flush before mutate() resolves.
      onSendMessage(message)
      await sendMessageMutation.mutate({ channelID: channel.ID, message: message, attachments: attachments })
      setMessage('')
      releaseFiles(files)
      setFiles([])
    } catch (error) {
      console.error(error)
    } finally {
      setUploading(false)
      setUploadProgress({})
    }
  }
  const addFiles = (selected: FileList | File[]) => {
    const next = Array.from(selected).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    if (next.length === 0) return
    setFiles((prev) => [...prev, ...next])
  }
  const openFilePicker = () => {
    fileInputRef.current?.click()
  }
  return (
    <div className="flex flex-col items-center justify-start rounded-md w-full bg-background-secondary p-2 gap-2">
      {files.length > 0 && (
        <div className="flex flex-row overflow-x-auto items-center justify-start gap-2 w-full">
          {files.map((item) => {
            const percent = uploadProgress[item.id]
            return <div key={item.id} className="flex flex-row items-center justify-start gap-2 w-24 h-24 relative shrink-0">
              {!uploading && (
                <button className="w-8 h-8 rounded-md bg-background-secondary hover:bg-background-tertiary absolute top-0 right-0 z-20 flex items-center justify-center cursor-pointer" onClick={() => removeFile(item.id)}>
                  <TrashIcon className="w-4 h-4 text-error" />
                </button>
              )}
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover rounded-md" />
              ) : (
                <FileIcon className="w-full h-full text-foreground-muted" />
              )}
              {percent !== undefined && <UploadProgress percent={percent} />}
            </div>
          })}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />
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

function AttachmentItem({ attachment: { url, filename }, onMouseEnter, onMouseLeave }: { attachment: { url: string, filename: string } } & HoverProps) {
  const tether = useTether()
  const [contentType, setContentType] = useState<string | null>(null)
  const [size, setSize] = useState<number>(0)
  async function fetchAttachment() {
    const response = await fetch(tether.url.replace('/tether', '') + url)
    if (!response.ok) {
      await response.body?.cancel()
      setContentType('')
      return null
    }
    
    setContentType(response.headers.get('content-type') ?? '')
    setSize(Number(response.headers.get('content-length') ?? 0))
    await response.body?.cancel()
  }
  useEffect(() => {
    fetchAttachment()
  }, [url])
  const src = tether.url.replace('/tether', '') + url
  if (contentType?.startsWith('image/')) {
    return <img src={src} alt={filename} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="block h-64 object-cover rounded-md mb-1" />
  } else if (contentType?.startsWith('video/')) {
    return <div className="basis-full" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <video src={src} className="block h-auto w-auto max-h-64 max-w-full rounded-md mb-1" controls />
    </div>
  } else if (contentType?.startsWith('audio/')) {
    return <div className="basis-full" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <audio src={src} className="block w-full mb-1" controls />
    </div>
  } else if (contentType === null) {
    return <div className="w-32 h-32 rounded-md bg-background" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
  } else {
    return <FileAttachment src={src} filename={filename} size={size} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
  }
}

function MessageItem({ message, user, compact }: { message: any, user: any, compact: boolean }) {
  const tether = useTether()
  const [isHovered, setIsHovered] = useState(false)
  const [isAttachmentHovered, setIsAttachmentHovered] = useState(false)
  const showHover = isHovered && !isAttachmentHovered
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
    <div className={`relative flex flex-row items-start justify-start ${showHover ? 'bg-foreground-ultra-muted' : ''} w-full px-2 gap-2 ${compact ? '' : 'mt-4'}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { setIsHovered(false); setIsAttachmentHovered(false) }}>
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
            {message.Attachments.map((attachment: { url: string, filename: string }, index: number) => (
              <AttachmentItem key={`${message.ID}:${index}`} attachment={{ url: attachment.url, filename: attachment.filename }} onMouseEnter={() => setIsAttachmentHovered(true)} onMouseLeave={() => setIsAttachmentHovered(false)} />
            ))}
          </div>
        )}
      </div>
      {showHover && !isEditing && <div className="absolute -top-4 right-1 flex flex-row items-center justify-center rounded-md bg-background-secondary p-1 gap-2">
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