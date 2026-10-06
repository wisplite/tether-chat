import { useEffect, useId, useRef, type ReactNode } from 'react'
import { XIcon } from '@phosphor-icons/react'

type ChatModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function ChatModal({ open, onClose, title, children }: ChatModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current
    if (!dialog) return
    const rect = dialog.getBoundingClientRect()
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!inside) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] rounded-[2px] border border-background-tertiary bg-background-secondary p-0 text-foreground shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-row items-center justify-between gap-4 border-b border-background-tertiary px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-foreground-muted transition-colors hover:bg-background-tertiary hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary"
          onClick={onClose}
        >
          <XIcon size={16} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}
