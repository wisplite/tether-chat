import { useMutation, useQuery, useTether } from '@tetherdb/react'
import { CameraIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ProfileCardView, type ProfilePreview } from '../ProfileCard'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function assetUrl(tetherUrl: string, path?: string) {
    if (!path) return ''
    if (/^(https?:|blob:|data:)/i.test(path)) return path
    const base = tetherUrl.replace(/\/tether\/?$/, '')
    return base + (path.startsWith('/') ? path : `/${path}`)
}

function errorMessage(error: unknown) {
    if (!error) return 'Something went wrong'
    if (typeof error === 'string') return error
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        return error.message
    }
    return 'Something went wrong'
}

function putFile(url: string, file: File) {
    return new Promise<boolean>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
        xhr.onerror = () => reject(new Error('upload failed'))
        xhr.send(file)
    })
}

function Profile() {
    const tether = useTether()
    const { data: user } = useQuery('getUserInfo')
    const [nickname, setNickname] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [bio, setBio] = useState<string | null>(null)
    const [photo, setPhoto] = useState<File | null>(null)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const seenUserId = useRef<string | undefined>(undefined)
    const avatarBeforeUpload = useRef('')
    const shownNickname = nickname ?? user?.Nickname ?? ''
    const shownBio = bio ?? user?.Bio ?? ''
    const shownStatus = status ?? user?.Status ?? ''
    const { mutate: updateProfile } = useMutation('updateProfile')
    const { mutate: uploadAvatar } = useMutation('uploadAvatar')
    const previewAvatar = photoUrl ?? user?.AvatarUrl ?? ''
    const preview = useMemo<ProfilePreview>(() => ({
        username: user?.Username ?? '',
        nickname: shownNickname,
        bio: shownBio,
        avatarUrl: previewAvatar,
        role: user?.Role ?? '',
        status: shownStatus,
        presence: user?.Presence ?? '',
        createdAt: user?.CreatedAt ?? '',
    }), [shownNickname, shownBio, shownStatus, previewAvatar, user?.Username, user?.Role, user?.Presence, user?.CreatedAt])
    const replacePhoto = (file: File | null) => {
        const nextUrl = file ? URL.createObjectURL(file) : null
        setPhoto(file)
        setPhotoUrl((current) => {
            if (current && current !== nextUrl) URL.revokeObjectURL(current)
            return nextUrl
        })
    }
    useEffect(() => {
        const id = user?.ID as string | undefined
        if (seenUserId.current && seenUserId.current !== id) {
            setNickname(null)
            setBio(null)
            setStatus(null)
            replacePhoto(null)
            setError('')
        }
        seenUserId.current = id
    }, [user?.ID])
    useEffect(() => {
        if (!photoUrl || photo) return
        if ((user?.AvatarUrl ?? '') === avatarBeforeUpload.current) return
        replacePhoto(null)
    }, [user?.AvatarUrl, photo, photoUrl])
    const avatarSrc = assetUrl(tether.url, previewAvatar)
    const initial = (shownNickname || user?.Username || '?').slice(0, 1).toUpperCase()
    const choosePhoto = (file: File | undefined) => {
        if (!file) return
        if (!AVATAR_TYPES.includes(file.type)) {
            setError('Photo must be a JPEG, PNG, GIF, or WebP image.')
            return
        }
        if (file.size > MAX_AVATAR_BYTES) {
            setError('Photo must be 5 MB or smaller.')
            return
        }
        setError('')
        avatarBeforeUpload.current = user?.AvatarUrl ?? ''
        replacePhoto(file)
    }
    const clearPhoto = () => {
        replacePhoto(null)
    }
    const handleSave = async () => {
        const nextNickname = shownNickname.trim()
        if (!nextNickname) {
            setError('Nickname is required.')
            return
        }
        setSaving(true)
        setError('')
        try {
            let avatarFileID = ''
            if (photo) {
                const uploadData = await uploadAvatar({})
                if (uploadData.error || !uploadData.uploadURL || !uploadData.fileID) {
                    setError(errorMessage(uploadData.error))
                    return
                }
                const uploaded = await putFile(tether.url.replace(/\/tether\/?$/, '') + uploadData.uploadURL, photo)
                if (!uploaded) {
                    setError('Could not upload photo.')
                    return
                }
                avatarFileID = uploadData.fileID
            }
            const result = await updateProfile({
                nickname: nextNickname,
                status: shownStatus,
                bio: shownBio,
                ...(avatarFileID ? { avatarFileID } : {}),
            })
            if (result.error) {
                setError(errorMessage(result.error))
                return
            }
            setNickname(nextNickname)
            setStatus(shownStatus)
            setBio(shownBio)
            setPhoto(null)
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setSaving(false)
        }
    }
    const handleCancel = () => {
        setNickname(user?.Nickname ?? null)
        setBio(user?.Bio ?? null)
        setStatus(user?.Status ?? null)
        clearPhoto()
        setError('')
    }
    return (
        <div className="flex h-dvh w-full bg-background">
            <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto p-4">
                <h1 className="text-2xl font-bold">Profile</h1>
                <div className="flex items-center gap-3">
                    <button type="button" aria-label="Upload profile photo" disabled={saving} onClick={() => fileInputRef.current?.click()} className="group relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-[2px] border border-background-tertiary bg-background-tertiary focus-visible:outline-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50">
                        {avatarSrc ? (
                            <img src={avatarSrc} alt="" className="size-full object-cover" />
                        ) : (
                            <span aria-hidden="true" className="flex size-full items-center justify-center text-lg font-semibold">{initial}</span>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                            <CameraIcon size={18} />
                        </span>
                    </button>
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-medium">Profile photo</span>
                        <div className="flex flex-row gap-2">
                            <button type="button" disabled={saving} onClick={() => fileInputRef.current?.click()} className="cursor-pointer rounded-[2px] bg-background-tertiary px-2 py-1 text-sm text-foreground hover:bg-background-tertiary/80 focus-visible:outline-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50">Choose image</button>
                            {photo && (
                                <button type="button" disabled={saving} onClick={clearPhoto} className="cursor-pointer rounded-[2px] px-2 py-1 text-sm text-foreground-muted hover:bg-foreground-muted-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50">Undo</button>
                            )}
                        </div>
                        <p className="text-xs text-foreground-muted">JPEG, PNG, GIF, or WebP. Up to 5 MB.</p>
                    </div>
                </div>
                <input
                    ref={fileInputRef}
                    id="avatar"
                    type="file"
                    accept={AVATAR_TYPES.join(',')}
                    className="hidden"
                    onChange={(e) => {
                        choosePhoto(e.target.files?.[0])
                        e.target.value = ''
                    }}
                />
                <div className="flex flex-col gap-2">
                    <label htmlFor="nickname">Nickname</label>
                    <input id="nickname" type="text" required placeholder="Nickname" value={shownNickname} disabled={saving} onChange={(e) => { setNickname(e.target.value); setError('') }} aria-invalid={error === 'Nickname is required.'} className="rounded-md border border-background-tertiary bg-background-secondary p-2 text-sm text-foreground disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-2">
                    <label htmlFor="status">Status</label>
                    <input id="status" type="text" placeholder="Status" value={shownStatus} disabled={saving} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-background-tertiary bg-background-secondary p-2 text-sm text-foreground disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-2">
                    <label htmlFor="bio">Bio</label>
                    <textarea id="bio" rows={4} placeholder="Bio" value={shownBio} disabled={saving} onChange={(e) => setBio(e.target.value)} className="resize-none rounded-md border border-background-tertiary bg-background-secondary p-2 text-sm text-foreground disabled:opacity-50" />
                </div>
                {error && <p role="alert" className="text-sm text-error">{error}</p>}
                <div className="flex flex-row gap-2">
                    <button type="button" onClick={handleCancel} disabled={saving} className="flex-1 cursor-pointer rounded-md bg-background-tertiary p-2 text-sm text-foreground hover:bg-background-tertiary/80 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={handleSave} disabled={saving || !user?.ID} className="flex-1 cursor-pointer rounded-md bg-accent p-2 text-sm text-background hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                <h2 className="text-2xl font-bold">Preview</h2>
                <ProfileCardView profile={preview} />
            </div>
        </div>
    )
}

export default Profile
