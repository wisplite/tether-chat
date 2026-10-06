import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useMutation } from '@tetherdb/react'

// Pixels the pointer must travel before a press turns into a drag, so plain clicks still navigate.
const DRAG_THRESHOLD = 5

type Channel = { ID: string, Name: string, Rank: string }
type Drag = { id: string, beforeID: string, keyboard: boolean }

export default function ChannelList({ channels, canReorder, renderChannel }: {
    channels: Channel[], canReorder: boolean, renderChannel: (channel: Channel) => ReactNode
}) {
    const { mutate } = useMutation('reorderChannel')
    const [drag, setDrag] = useState<Drag | null>(null)
    const dragRef = useRef<Drag | null>(null)
    const [saving, setSaving] = useState(false)
    const savingRef = useRef(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const listRef = useRef<HTMLDivElement>(null)
    const pointer = useRef<{ x: number, y: number } | null>(null)
    const frame = useRef(0)
    const suppressClick = useRef(false)
    const channelsRef = useRef(channels)
    useLayoutEffect(() => { channelsRef.current = channels }, [channels])

    const updateDrag = (next: Drag | null) => {
        dragRef.current = next
        setDrag(next)
    }
    const stopScroll = () => {
        cancelAnimationFrame(frame.current)
        pointer.current = null
    }
    useEffect(() => () => cancelAnimationFrame(frame.current), [])

    const cancel = () => {
        stopScroll()
        updateDrag(null)
        setMessage('Reordering cancelled.')
    }
    const commit = async () => {
        const move = dragRef.current
        stopScroll()
        updateDrag(null)
        if (!move || savingRef.current) return
        const current = channelsRef.current
        const index = current.findIndex(channel => channel.ID === move.id)
        if (index < 0 || (current[index + 1]?.ID ?? '') === move.beforeID) return
        savingRef.current = true
        setSaving(true)
        setError('')
        try {
            await mutate({ channelID: move.id, beforeID: move.beforeID })
            setMessage('Channel order saved.')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save channel order. Try again.')
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }
    const locateDestination = () => {
        const point = pointer.current
        const active = dragRef.current
        const list = listRef.current
        if (!point || !active || !list) return
        const bounds = list.getBoundingClientRect()
        if (point.x < bounds.left - 40 || point.x > bounds.right + 40) return
        const rows = [...list.querySelectorAll<HTMLElement>('[data-channel-row]')]
        const next = rows.find(row => {
            const rect = row.getBoundingClientRect()
            return row.dataset.channelRow !== active.id && point.y < rect.top + rect.height / 2
        })
        const beforeID = next?.dataset.channelRow ?? ''
        if (beforeID !== active.beforeID) updateDrag({ ...active, beforeID })
    }
    const scroll = () => {
        const scroller = listRef.current?.parentElement
        const point = pointer.current
        if (!scroller || !point || !dragRef.current) return
        const bounds = scroller.getBoundingClientRect()
        if (point.x >= bounds.left - 40 && point.x <= bounds.right + 40) {
            const edge = 40
            const delta = point.y < bounds.top + edge ? -8 : point.y > bounds.bottom - edge ? 8 : 0
            if (delta) scroller.scrollTop += delta
            locateDestination()
        }
        frame.current = requestAnimationFrame(scroll)
    }
    const beginDrag = (channel: Channel, x: number, y: number) => {
        const index = channelsRef.current.findIndex(item => item.ID === channel.ID)
        updateDrag({ id: channel.ID, beforeID: channelsRef.current[index + 1]?.ID ?? '', keyboard: false })
        setError('')
        pointer.current = { x, y }
        frame.current = requestAnimationFrame(scroll)
    }
    const startPointer = (event: PointerEvent<HTMLDivElement>, channel: Channel) => {
        if (!canReorder || event.button !== 0 || event.pointerType === 'touch') return
        if (savingRef.current || dragRef.current) return
        // Ignore presses that come from portaled content (e.g. the settings modal) or the settings button.
        const target = event.target as HTMLElement
        if (!event.currentTarget.contains(target) || target.closest('button, input, textarea, select')) return
        const { pointerId, clientX: startX, clientY: startY } = event
        let dragging = false
        const previous = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect }
        const finish = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onCancel)
            window.removeEventListener('keydown', onEscape, true)
            if (dragging) {
                document.body.style.cursor = previous.cursor
                document.body.style.userSelect = previous.userSelect
                // The release would otherwise be treated as a click on the link.
                suppressClick.current = true
                setTimeout(() => { suppressClick.current = false }, 0)
            }
        }
        const onMove = (move: globalThis.PointerEvent) => {
            if (move.pointerId !== pointerId) return
            if (!dragging) {
                if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD) return
                dragging = true
                document.body.style.cursor = 'grabbing'
                document.body.style.userSelect = 'none'
                beginDrag(channel, move.clientX, move.clientY)
            }
            pointer.current = { x: move.clientX, y: move.clientY }
            locateDestination()
        }
        const onUp = (up: globalThis.PointerEvent) => {
            if (up.pointerId !== pointerId) return
            const wasDragging = dragging
            finish()
            if (!wasDragging) return
            const bounds = listRef.current?.parentElement?.getBoundingClientRect()
            if (!bounds || up.clientX < bounds.left || up.clientX > bounds.right || up.clientY < bounds.top || up.clientY > bounds.bottom) cancel()
            else void commit()
        }
        const onCancel = (cancelled: globalThis.PointerEvent) => {
            if (cancelled.pointerId !== pointerId) return
            const wasDragging = dragging
            finish()
            if (wasDragging) cancel()
        }
        const onEscape = (key: globalThis.KeyboardEvent) => {
            if (key.key !== 'Escape' || !dragging) return
            key.preventDefault()
            finish()
            cancel()
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
        window.addEventListener('keydown', onEscape, true)
    }
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, channel: Channel) => {
        if (!canReorder || savingRef.current || !event.currentTarget.contains(event.target as Node)) return
        const active = dragRef.current
        if (active && !active.keyboard) return
        if (event.key === 'Escape' && active) {
            event.preventDefault()
            cancel()
        } else if (active && (event.key === ' ' || event.key === 'Enter')) {
            event.preventDefault()
            void commit()
        } else if (event.key === 'Tab' && active) {
            cancel()
        } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && (active || (event.altKey && event.key.startsWith('Arrow')))) {
            event.preventDefault()
            const current = active ?? { id: channel.ID, beforeID: '', keyboard: true }
            const rest = channels.filter(item => item.ID !== current.id)
            const index = active
                ? (active.beforeID ? rest.findIndex(item => item.ID === active.beforeID) : rest.length)
                : channels.findIndex(item => item.ID === channel.ID)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? rest.length : Math.max(0, Math.min(rest.length, index + (event.key === 'ArrowUp' ? -1 : 1)))
            if (!active) {
                setError('')
                setMessage(`Moving ${channel.Name}. Use arrow keys, then Enter to save or Escape to cancel.`)
            } else {
                setMessage(`Position ${next + 1} of ${channels.length}.`)
            }
            updateDrag({ ...current, beforeID: rest[next]?.ID ?? '' })
        }
    }
    const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
        if (!suppressClick.current) return
        event.preventDefault()
        event.stopPropagation()
    }

    return <div ref={listRef} className="flex flex-col gap-0.5" aria-label="Channel list" aria-busy={saving}>
        {channels.map(channel => <div key={channel.ID} data-channel-row={channel.ID}
            onPointerDown={event => startPointer(event, channel)}
            onKeyDown={event => onKeyDown(event, channel)}
            onClickCapture={onClickCapture}
            onDragStart={canReorder ? event => event.preventDefault() : undefined}
            className={`relative min-w-0 rounded-[2px] ${drag?.id === channel.ID ? 'bg-accent-light opacity-60' : ''}`}>
            {drag?.beforeID === channel.ID && <div className="pointer-events-none absolute -top-px inset-x-0 z-10 h-0.5 bg-brand-primary" />}
            {renderChannel(channel)}
        </div>)}
        {drag?.beforeID === '' && <div className="h-0.5 bg-brand-primary" />}
        {channels.length === 0 && <p className="px-3 py-2 text-xs leading-5 text-foreground-muted">Create a channel to start a conversation.</p>}
        <span id="channel-reorder-help" className="sr-only">Press Alt and an arrow key on a channel to move it, arrow keys to keep moving, Enter to save, or Escape to cancel.</span>
        <p role="status" className={saving ? 'px-2 py-1 text-xs text-foreground-muted' : 'sr-only'}>{saving ? 'Saving channel order…' : message}</p>
        {error && <p role="alert" className="px-2 py-1 text-xs text-error">{error}</p>}
    </div>
}
