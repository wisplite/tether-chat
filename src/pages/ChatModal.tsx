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
      className="m-auto w-full max-w-md rounded-lg border border-background-tertiary bg-background p-0 text-foreground shadow-lg backdrop:bg-foreground/40"
    >
      <div className="flex flex-row items-center justify-between gap-4 border-b border-foreground-ultra-muted px-4 py-3">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          className="cursor-pointer text-foreground-muted hover:text-foreground"
          onClick={onClose}
        >
          <XIcon size={16} />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  )
}
