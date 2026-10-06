import { newId } from '@/utils/id'
import { supabase } from './supabase'

// Item photos live in a private bucket, one folder per group (see the item_photos migration).
const bucket = () => supabase.storage.from('item-photos')

/** Longest side after shrinking: plenty for a phone screen, ~100 KB as JPEG. */
const MAX_SIDE = 1280
const QUALITY = 0.75
/** Signed URLs last an hour; they are renewed a few minutes before that. */
const SIGNED_FOR_S = 3600
const RENEW_MARGIN_MS = 5 * 60_000

/**
 * Shrinks a camera photo (often 3–6 MB) to a small JPEG before it is uploaded.
 * Browsers apply the EXIF rotation when decoding, so the canvas gets the photo upright.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const src = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', QUALITY),
    )
  } finally {
    URL.revokeObjectURL(src)
  }
}

/** Files are never overwritten: every new photo gets its own path. */
export const newPhotoPath = (groupId: string) => `${groupId}/${newId()}.jpg`

export const uploadPhoto = (path: string, photo: Blob) =>
  bucket().upload(path, photo, { contentType: 'image/jpeg', cacheControl: '31536000' })

export const deletePhoto = (path: string) => bucket().remove([path])

const urls = new Map<string, { url: Promise<string>; expires: number }>()

/** A URL the <img> can load. Cached, so each photo is signed once an hour at most. */
export function photoUrl(path: string): Promise<string> {
  const cached = urls.get(path)
  if (cached && cached.expires > Date.now()) return cached.url
  const entry = {
    url: bucket()
      .createSignedUrl(path, SIGNED_FOR_S)
      .then(({ data, error }) => {
        if (error) throw error
        return data.signedUrl
      }),
    expires: Date.now() + SIGNED_FOR_S * 1000 - RENEW_MARGIN_MS,
  }
  // Not cached on failure: on another phone the upload may simply not have finished yet.
  entry.url.catch(() => {
    if (urls.get(path) === entry) urls.delete(path)
  })
  urls.set(path, entry)
  return entry.url
}

/** The device that took the photo shows it straight away, before (and without) downloading it. */
export function showPhotoLocally(path: string, photo: Blob) {
  urls.set(path, { url: Promise.resolve(URL.createObjectURL(photo)), expires: Infinity })
}
