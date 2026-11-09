// Mirrors the server's upload rules (spec §3.5) so growers get instant
// feedback. The server stays authoritative: it decodes the file and also
// checks dimensions, which the browser cannot know before upload.
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/** Returns null for an acceptable photo, otherwise the API error code it would get. */
export function validatePhotoFile(file) {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) return 'unsupported_image_type'
  if (file.size > MAX_PHOTO_BYTES) return 'image_too_large'
  return null
}
