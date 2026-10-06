import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useTether } from '@tetherdb/react'

export type ProfilePreview = {
  username?: string
  nickname?: string
  avatarUrl?: string
  role?: string
  status?: string
  presence?: string
  bio?: string
  createdAt?: string
}

type ProfileContextValue = {
  open: boolean
  popoverId: string
  toggle: (anchor: HTMLElement) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

const PRESENCE: Record<string, { label: string, dot: string }> = {
  online: { label: 'Online', dot: 'bg-success' },
  idle: { label: 'Idle', dot: 'bg-warning' },
  dnd: { label: 'Do not disturb', dot: 'bg-error' },
  offline: { label: 'Offline', dot: 'bg-foreground-muted' },
}

function assetUrl(tetherUrl: string, path?: string) {
  if (!path) return ''
  const base = tetherUrl.replace(/\/tether\/?$/, '')
  return base + (path.startsWith('/') ? path : `/${path}`)
}

function readProfile(raw: any): ProfilePreview {
  if (!raw || typeof raw !== 'object') return {}
  return {
    username: raw.Username ?? raw.username ?? '',
    nickname: raw.Nickname ?? raw.nickname ?? '',
    avatarUrl: raw.AvatarUrl ?? raw.avatarUrl ?? '',
    role: raw.Role ?? raw.role ?? '',
    status: raw.Status ?? raw.status ?? '',
    presence: raw.Presence ?? raw.presence ?? '',
    bio: raw.Bio ?? raw.bio ?? '',
    createdAt: raw.CreatedAt ?? raw.createdAt ?? '',
  }
}

function formatJoined(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1970) return ''
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function placeProfileCard(trigger: { left: number, right: number, top: number, bottom: number }, card: { width: number, height: number }, viewport: { width: number, height: number }) {
  const gap = 8
  const margin = 8
  // Left-align with the trigger and sit above the avatar and name.
  // A trigger against the right edge (member list) keeps the card beside it.
  let left = trigger.left
  let top = trigger.top - gap - card.height
  if (left + card.width > viewport.width - margin) {
    const beside = trigger.left - gap - card.width
    if (beside >= margin) {
      left = beside
      top = trigger.top
      if (top + card.height > viewport.height - margin) {
        const above = trigger.top - gap - card.height
        top = above >= margin ? above : viewport.height - margin - card.height
      }
    } else if (top < margin) {
      top = trigger.bottom + gap
    }
  } else if (top < margin) {
    top = trigger.bottom + gap
  }
  left = Math.max(margin, Math.min(left, viewport.width - margin - card.width))
  top = Math.max(margin, Math.min(top, Math.max(margin, viewport.height - margin - card.height)))
  return { left, top }
}

export function ProfileCard({ userId, preview, children }: { userId: string, preview?: ProfilePreview, children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const popoverId = useId()
  const close = useCallback(() => setOpen(false), [])
  const toggle = (next: HTMLElement) => {
    if (!userId) return
    if (open && anchor === next) {
      setOpen(false)
      return
    }
    setAnchor(next)
    setOpen(true)
  }
  return (
    <ProfileContext.Provider value={{ open, popoverId, toggle }}>
      {children}
      {open && anchor && (
        <ProfilePopover userId={userId} preview={preview} anchor={anchor} popoverId={popoverId} onClose={close} />
      )}
    </ProfileContext.Provider>
  )
}

export function ProfileButton({ className, children, label }: { className?: string, children: ReactNode, label?: string }) {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('ProfileButton must be used within ProfileCard')
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={ctx.open}
      aria-controls={ctx.open ? ctx.popoverId : undefined}
      onClick={(event) => ctx.toggle(event.currentTarget)}
    >
      {children}
    </button>
  )
}

function ProfilePopover({ userId, preview, anchor, popoverId, onClose }: { userId: string, preview?: ProfilePreview, anchor: HTMLElement, popoverId: string, onClose: () => void }) {
  const tether = useTether()
  const popoverRef = useRef<HTMLDivElement>(null)
  const { data, error } = useQuery('getUser', { userID: userId })
  const user = data ? readProfile(data) : readProfile(preview)
  const displayName = user.nickname || user.username || (data ? 'User' : '')
  const handle = user.username && user.username !== displayName ? user.username : ''
  const presence = PRESENCE[(user.presence ?? '').toLowerCase()]
  const isAdmin = user.role === 'admin'
  const joined = formatJoined(user.createdAt)
  const avatarSrc = assetUrl(tether.url, user.avatarUrl)

  useLayoutEffect(() => {
    const popover = popoverRef.current
    if (!popover) return
    const place = () => {
      const alignTarget = anchor.closest('[data-profile-align]')
      const box = alignTarget instanceof HTMLElement ? alignTarget : anchor
      const trigger = box.getBoundingClientRect()
      if (!anchor.isConnected || !box.isConnected || trigger.width === 0 || trigger.height === 0) {
        onClose()
        return
      }
      const card = popover.getBoundingClientRect()
      const { left, top } = placeProfileCard(trigger, card, {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      })
      popover.style.left = `${left}px`
      popover.style.top = `${top}px`
    }
    place()
    const resizeObserver = new ResizeObserver(place)
    resizeObserver.observe(popover)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, data, error, onClose, user.bio, user.status])

  useLayoutEffect(() => {
    popoverRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target)) return
      if (anchor.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      anchor.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={popoverRef}
      id={popoverId}
      role="dialog"
      tabIndex={-1}
      style={{ left: 0, top: 0 }}
      aria-label={displayName ? `${displayName} profile` : 'Profile'}
      className="fixed z-50 w-[280px] max-h-[min(440px,calc(100dvh-16px))] overflow-y-auto rounded-[2px] border border-background-tertiary bg-background-secondary text-foreground shadow-lg outline-none"
    >
      <div className="h-16 bg-brand-primary" />
      <div className="px-4 pb-4">
        <div className="relative -mt-8 size-16">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-[2px] border-4 border-background-secondary bg-background-tertiary text-lg font-semibold">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="size-full object-cover" />
            ) : (
              <span aria-hidden="true">{(displayName || '?').slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          {presence && (
            <span className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-background-secondary ${presence.dot}`} title={presence.label}>
              <span className="sr-only">{presence.label}</span>
            </span>
          )}
        </div>
        {displayName ? (
          <h2 className="mt-2 text-base font-bold tracking-[-0.03em]">{displayName}</h2>
        ) : (
          <p className="mt-2 text-[13px] text-foreground-muted">Loading profile…</p>
        )}
        {handle && <p className="text-[12px] leading-5 text-foreground-muted">{handle}</p>}
        {user.status?.trim() && <p className="mt-2 text-[13px] leading-5">{user.status}</p>}
        {user.bio?.trim() && (
          <div className="mt-3">
            <p className="text-[11px] font-medium text-foreground-muted">About</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5">{user.bio}</p>
          </div>
        )}
        <div className="mt-3 rounded-[2px] border border-background-tertiary bg-background px-3 py-2.5">
          <p className="text-[11px] font-medium text-foreground-muted">Roles</p>
          <div className="mt-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-[2px] px-2 py-0.5 text-[12px] font-medium ${isAdmin ? 'bg-brand-primary/10 text-brand-primary' : 'bg-foreground-muted-hover text-foreground'}`}>
              <span className={`size-2 rounded-full ${isAdmin ? 'bg-brand-primary' : 'bg-foreground-muted'}`} />
              {isAdmin ? 'Admin' : 'Member'}
            </span>
          </div>
        </div>
        {joined && (
          <div className="mt-3">
            <p className="text-[11px] font-medium text-foreground-muted">Member since</p>
            <p className="mt-1 text-[13px] leading-5">{joined}</p>
          </div>
        )}
        {error && !data && <p role="alert" className="mt-3 text-[13px] leading-5 text-error">Unable to load profile.</p>}
      </div>
    </div>,
    document.body,
  )
}
