import { http, HttpResponse } from 'msw'

/** Matches the API path on any origin, e.g. apiPath('/plants') → '*\/api/plants'. */
export const apiPath = (path) => `*/api${path}`

/** A response in the backend's uniform error shape (spec §3.4). */
export function errorResponse(status, code, { message = code, fields } = {}) {
  return HttpResponse.json({ code, message, ...(fields ? { fields } : {}) }, { status })
}

/**
 * Reads a multipart/form-data request as { fieldName: value }, where a file
 * field's value is its filename. (undici's request.formData() cannot build
 * files under jsdom, so the small test payloads are parsed from text.)
 */
export async function readMultipart(request) {
  const boundary = request.headers.get('content-type').split('boundary=')[1]
  const body = await request.text()
  const fields = {}
  for (const part of body.split(`--${boundary}`)) {
    const match = part.match(/name="([^"]+)"(?:; filename="([^"]*)")?[\s\S]*?\r\n\r\n([\s\S]*)\r\n$/)
    if (match) fields[match[1]] = match[2] ?? match[3]
  }
  return fields
}

/** GET /api/auth/me answering as `user`, or as signed out when `user` is null. */
export function meHandler(user) {
  return http.get(apiPath('/auth/me'), () =>
    user ? HttpResponse.json(user) : errorResponse(401, 'not_authenticated'),
  )
}
