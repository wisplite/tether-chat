import { useMutation, useQuery, useTether } from '@tetherdb/react'
import { CameraIcon, CheckCircleIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ProfileCardView, type ProfilePreview } from '../ProfileCard'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DEFAULT_PROFILE_COLOR = '#3d60bb'
const HEX_COLOR = /^#(?:[0-9a-fA-F]{6})$/

function hexColor(value?: string | null) {
    const color = (value ?? '').trim()
    const withHash = color.startsWith('#') ? color : `#${color}`
    return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : ''
}

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

function putFile(url: string, file: File, onProgress: (percent: number) => void) {
    return new Promise<boolean>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100))
        }
        xhr.timeout = 120000
        xhr.ontimeout = () => reject(new Error('Photo upload timed out. Please try again.'))
        xhr.onerror = () => reject(new Error('Photo upload failed. Please try again.'))
        xhr.send(file)
    })
}

function Profile() {
    const tether = useTether()
    const { data: user, error: loadError } = useQuery('getUserInfo')
    const [nickname, setNickname] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [bio, setBio] = useState<string | null>(null)
    const [profileColor, setProfileColor] = useState<string | null>(null)
    const [colorDraft, setColorDraft] = useState<string | null>(null)
    const [colorBlurred, setColorBlurred] = useState(false)
    const [photo, setPhoto] = useState<File | null>(null)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState('')
    const [uploadProgress, setUploadProgress] = useState<number | null>(null)
    const [saved, setSaved] = useState<{ nickname: string, status: string, bio: string, profileColor: string } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const seenUserId = useRef<string | undefined>(undefined)
    const avatarBeforeUpload = useRef('')
    const shownNickname = nickname ?? user?.Nickname ?? ''
    const shownBio = bio ?? user?.Bio ?? ''
    const shownStatus = status ?? user?.Status ?? ''
    const shownColor = hexColor(profileColor ?? user?.ProfileColor) || DEFAULT_PROFILE_COLOR
    const colorText = colorDraft ?? shownColor
    const colorInvalid = !hexColor(colorText)
    const baseline = saved ?? { nickname: user?.Nickname ?? '', status: user?.Status ?? '', bio: user?.Bio ?? '', profileColor: hexColor(user?.ProfileColor) || DEFAULT_PROFILE_COLOR }
    const dirty = !!photo || shownNickname !== baseline.nickname || shownStatus !== baseline.status || shownBio !== baseline.bio || colorText.trim().toLowerCase() !== baseline.profileColor
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
        profileColor: shownColor,
        createdAt: user?.CreatedAt ?? '',
    }), [shownNickname, shownBio, shownStatus, shownColor, previewAvatar, user?.Username, user?.Role, user?.Presence, user?.CreatedAt])
    const replacePhoto = (file: File | null) => {
        const nextUrl = file ? URL.createObjectURL(file) : null
        setPhoto(file)
        setPhotoUrl(nextUrl)
    }
    useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])
    useEffect(() => {
        const id = user?.ID as string | undefined
        if (seenUserId.current && seenUserId.current !== id) {
            setNickname(null)
            setBio(null)
            setStatus(null)
            setProfileColor(null)
            setColorDraft(null)
            setColorBlurred(false)
            replacePhoto(null)
            setError('')
            setSaved(null)
            setFeedback('')
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
        setFeedback('')
        avatarBeforeUpload.current = user?.AvatarUrl ?? ''
        replacePhoto(file)
    }
    const clearPhoto = () => {
        replacePhoto(null)
    }
    const handleSave = async () => {
        if (saving || !user?.ID || !dirty) return
        const nextNickname = shownNickname.trim()
        const nextColor = hexColor(colorText)
        if (!nextNickname) {
            setError('Nickname is required.')
            return
        }
        if (!nextColor) {
            setColorBlurred(true)
            setError('Profile color must be a hex color like #3d60bb.')
            return
        }
        setSaving(true)
        setError('')
        setFeedback(photo ? 'Preparing photo upload…' : 'Saving profile…')
        setUploadProgress(null)
        try {
            let avatarFileID = ''
            if (photo) {
                const uploadData = await uploadAvatar({})
                if (uploadData.error || !uploadData.uploadURL || !uploadData.fileID) {
                    setError(errorMessage(uploadData.error))
                    return
                }
                setFeedback('Uploading photo…')
                setUploadProgress(0)
                const uploaded = await putFile(tether.url.replace(/\/tether\/?$/, '') + uploadData.uploadURL, photo, setUploadProgress)
                if (!uploaded) {
                    setError('Could not upload photo.')
                    return
                }
                avatarFileID = uploadData.fileID
            }
            setUploadProgress(null)
            setFeedback('Saving profile…')
            const result = await updateProfile({
                nickname: nextNickname,
                status: shownStatus,
                bio: shownBio,
                profileColor: nextColor,
                ...(avatarFileID ? { avatarFileID } : {}),
            })
            if (result.error) {
                setError(errorMessage(result.error))
                return
            }
            setNickname(nextNickname)
            setStatus(shownStatus)
            setBio(shownBio)
            setProfileColor(nextColor)
            setColorDraft(null)
            setColorBlurred(false)
            setPhoto(null)
            setSaved({ nickname: nextNickname, status: shownStatus, bio: shownBio, profileColor: nextColor })
            setFeedback('Profile saved successfully.')
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setSaving(false)
            setUploadProgress(null)
        }
    }
    const handleCancel = () => {
        setNickname(baseline.nickname)
        setBio(baseline.bio)
        setStatus(baseline.status)
        setProfileColor(baseline.profileColor)
        setColorDraft(null)
        setColorBlurred(false)
        clearPhoto()
        setError('')
        setFeedback('Changes discarded.')
    }
    if (!user?.ID) return (
        <div className="settings-page">
            <header className="settings-heading"><h1>Profile</h1><p>Manage how you appear to others.</p></header>
            <div className="settings-panel" role={loadError ? 'alert' : 'status'}>
                {loadError ? <p className="text-error">Could not load your profile. {errorMessage(loadError)}</p> : <p className="flex items-center gap-2 text-foreground-muted"><CircleNotchIcon className="animate-spin motion-reduce:animate-none" size={18} />Loading your profile…</p>}
            </div>
        </div>
    )
    return (
        <div className="settings-page">
            <header className="settings-heading"><h1>Profile</h1><p>Manage how you appear to others.</p></header>
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_312px]">
            <form onSubmit={(event) => { event.preventDefault(); void handleSave() }} aria-busy={saving} className="settings-panel flex min-w-0 flex-col gap-5">
                <div><h2 className="text-base font-semibold">Your profile</h2></div>
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
                    <label className="font-medium" htmlFor="nickname">Nickname <span className="text-foreground-muted">(required)</span></label>
                    <input id="nickname" type="text" required placeholder="Nickname" value={shownNickname} disabled={saving} onChange={(e) => { setNickname(e.target.value); setError('') }} aria-invalid={error === 'Nickname is required.'} aria-describedby={error === 'Nickname is required.' ? 'profile-error' : undefined} className="rounded-md border border-background-tertiary bg-background-secondary p-2 text-sm text-foreground disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="font-medium" htmlFor="status">Status</label>
                    <input id="status" type="text" placeholder="What are you up to?" value={shownStatus} disabled={saving} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-background-tertiary bg-background-secondary p-2 text-sm text-foreground disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="font-medium" htmlFor="bio">Bio</label>
                    <textarea id="bio" rows={4} placeholder="A little about yourself…" value={shownBio} disabled={saving} onChange={(e) => setBio(e.target.value)} className="resize-none rounded-md border border-background-tertiary bg-background-secondary p-2 text-sm text-foreground disabled:opacity-50" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="font-medium" htmlFor="profile-color">Profile color</label>
                    <p id="profile-color-hint" className="text-xs text-foreground-muted">Shown on your profile banner. Pick a color or enter a hex value.</p>
                    <div className="flex items-center gap-3">
                        <input
                            id="profile-color"
                            type="color"
                            value={shownColor}
                            disabled={saving}
                            aria-describedby="profile-color-hint"
                            onChange={(e) => { setProfileColor(e.target.value.toLowerCase()); setColorDraft(null); setColorBlurred(false); setError(''); setFeedback('') }}
                            className="profile-color-input shrink-0"
                        />
                        <input
                            id="profile-color-hex"
                            type="text"
                            inputMode="text"
                            spellCheck={false}
                            autoCapitalize="none"
                            autoCorrect="off"
                            maxLength={7}
                            placeholder="#3d60bb"
                            value={colorText}
                            disabled={saving}
                            aria-label="Hex color"
                            aria-invalid={colorInvalid && colorBlurred}
                            aria-describedby={colorInvalid && colorBlurred ? 'profile-color-error' : 'profile-color-hint'}
                            onBlur={() => setColorBlurred(true)}
                            onChange={(e) => {
                                const value = e.target.value
                                const next = hexColor(value)
                                setError('')
                                setFeedback('')
                                if (next) {
                                    setProfileColor(next)
                                    setColorDraft(null)
                                    setColorBlurred(false)
                                    return
                                }
                                setColorDraft(value)
                            }}
                            className="w-32 rounded-md border border-background-tertiary bg-background-secondary p-2 font-mono text-sm text-foreground disabled:opacity-50"
                        />
                    </div>
                    {colorInvalid && colorBlurred && <p id="profile-color-error" className="text-xs text-error">Use a hex color like #3d60bb.</p>}
                </div>
                <div className="border-t border-background-tertiary pt-4">
                    {error && <p id="profile-error" role="alert" className="mb-3 text-sm text-error">{error}</p>}
                    <p role="status" aria-live="polite" className="mb-3 flex min-h-5 items-center gap-2 text-foreground-muted">
                        {saving ? <CircleNotchIcon size={16} className="shrink-0 animate-spin motion-reduce:animate-none" /> : !dirty && feedback === 'Profile saved successfully.' ? <CheckCircleIcon size={16} className="shrink-0 text-success" /> : null}
                        {saving ? feedback : dirty ? 'You have unsaved changes.' : error ? 'Your changes haven’t been saved.' : feedback || 'Your profile is up to date.'}
                    </p>
                    {uploadProgress !== null && <progress className="mb-3 h-1.5 w-full accent-accent" value={uploadProgress} max={100} aria-label={`Uploading photo, ${uploadProgress}%`} />}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={handleCancel} disabled={saving || !dirty} className="cursor-pointer rounded-md border border-background-tertiary px-3 py-2 font-medium hover:bg-foreground-muted-hover disabled:cursor-not-allowed disabled:opacity-50">Discard changes</button>
                        <button type="submit" disabled={saving || !dirty} className="cursor-pointer rounded-md bg-accent px-4 py-2 font-medium text-background hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
                    </div>
                </div>
            </form>
            <aside className="settings-panel flex min-w-0 flex-col gap-1 lg:sticky lg:top-0" aria-label="Profile preview">
                <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Live preview</h2></div>
                <p className="text-foreground-muted mb-3">This is how others will see your profile.</p>
                <ProfileCardView profile={preview} className="!w-full !max-h-none !shadow-none" />
            </aside>
            </div>
        </div>
    )
}

export default Profile
