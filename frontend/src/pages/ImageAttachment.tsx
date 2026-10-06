import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from '@phosphor-icons/react'

type ImageAttachmentProps = {
  src: string
  filename: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function ImageAttachment({ src, filename, onMouseEnter, onMouseLeave }: ImageAttachmentProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label={`View ${filename} fullscreen`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className="mb-1 block max-w-full cursor-zoom-in rounded-[2px] p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        <img src={src} alt={filename} className="block h-auto max-h-64 max-w-full rounded-[2px] border border-background-tertiary object-contain" />
      </button>
      {open && createPortal(
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault()
            setOpen(false)
          }}
          onClick={(event) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) setOpen(false)
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/90 p-0 text-white backdrop:bg-transparent open:flex open:flex-col"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
            <h2 id={titleId} className="min-w-0 truncate text-sm" title={filename}>{filename}</h2>
            <button
              type="button"
              autoFocus
              aria-label="Close image viewer"
              onClick={() => setOpen(false)}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[2px] hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
            >
              <XIcon size={24} />
            </button>
          </header>
          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false)
            }}
          >
            <img src={src} alt={filename} className="block h-auto max-h-full w-auto max-w-full object-contain" />
          </div>
        </dialog>,
        document.body,
      )}
    </>
  )
}
