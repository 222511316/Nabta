import axios from 'axios'

/** Every failed API call surfaces as an ApiError (spec §4.3). */
export class ApiError extends Error {
  constructor({ status, code, message, fields }) {
    super(message || code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields ?? {}
  }
}

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { Accept: 'application/json' },
})

const unauthorizedListeners = new Set()

/**
 * Registers a callback for when a protected request is refused because the
 * session has ended (expired, or signed out elsewhere). Returns an unsubscribe function.
 */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function toApiError(error) {
  const response = error.response
  if (!response) {
    return new ApiError({ status: 0, code: 'network_error', message: error.message })
  }
  const body = response.data
  if (body && typeof body === 'object' && typeof body.code === 'string') {
    return new ApiError({
      status: response.status,
      code: body.code,
      message: body.message,
      fields: body.fields,
    })
  }
  return new ApiError({
    status: response.status,
    code: response.status >= 500 ? 'server_error' : 'unknown',
    message: error.message,
  })
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error)
    // /auth/me answers 401 whenever nobody is signed in; that's not a lost session.
    const isSessionCheck = error.config?.url === '/auth/me'
    if (apiError.status === 401 && apiError.code === 'not_authenticated' && !isSessionCheck) {
      unauthorizedListeners.forEach((listener) => listener())
    }
    return Promise.reject(apiError)
  },
)
