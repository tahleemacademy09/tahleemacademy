import { supabase } from '@/lib/supabase'

type UploadPrefix = 'products/' | 'avatars/' | 'seller-covers/'

interface PresignResponse {
  uploadUrl: string
  publicUrl: string
  objectKey: string
  expiresInSeconds: number
}

/**
 * Uploads a single image file to Cloudflare R2 via the r2-presign edge function.
 * Returns the public URL to store in the DB (e.g. product_images.url), or throws on failure.
 */
export async function uploadToR2(file: File, prefix: UploadPrefix = 'products/'): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('You must be signed in to upload images.')
  }

  // 1. Ask our edge function for a presigned PUT url
  const presignRes = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-presign`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        prefix,
      }),
    }
  )

  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}))
    throw new Error(body.error ?? `Failed to get upload URL (${presignRes.status})`)
  }

  const { uploadUrl, publicUrl }: PresignResponse = await presignRes.json()

  // 2. Upload the actual file bytes straight to R2
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })

  if (!putRes.ok) {
    throw new Error(`Upload to storage failed (${putRes.status})`)
  }

  return publicUrl
}

/**
 * Uploads multiple images sequentially, returning their public URLs in order.
 * If one fails, already-uploaded URLs are still returned along with the error.
 */
export async function uploadManyToR2(
  files: File[],
  prefix: UploadPrefix = 'products/',
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const url = await uploadToR2(files[i], prefix)
    urls.push(url)
    onProgress?.(i + 1, files.length)
  }
  return urls
}
