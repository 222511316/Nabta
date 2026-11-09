import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiPath, errorResponse } from '../test/api'
import { server } from '../test/server'
import { ApiError, apiClient, onUnauthorized } from './client'

describe('API client errors', () => {
  it('turns the backend error shape into an ApiError with status, code and field codes', async () => {
    server.use(
      http.post(apiPath('/plants'), () =>
        errorResponse(422, 'validation_error', {
          message: 'Some fields need attention.',
          fields: { name: 'required' },
        }),
      ),
    )

    const error = await apiClient.post('/plants', {}).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Some fields need attention.',
      fields: { name: 'required' },
    })
  })

  it('reports an unreachable server as network_error', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.error()))

    const error = await apiClient.get('/plants').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, code: 'network_error', fields: {} })
  })

  it('reports a 5xx response without the error shape as server_error', async () => {
    server.use(
      http.get(
        apiPath('/plants'),
        () =>
          new HttpResponse('<h1>Bad gateway</h1>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    )

    const error = await apiClient.get('/plants').catch((e) => e)

    expect(error).toMatchObject({ status: 502, code: 'server_error', fields: {} })
  })
})

describe('session loss', () => {
  let unsubscribe = () => {}
  afterEach(() => unsubscribe())

  it('notifies listeners when a protected request is refused as not_authenticated', async () => {
    const listener = vi.fn()
    unsubscribe = onUnauthorized(listener)
    server.use(http.get(apiPath('/plants'), () => errorResponse(401, 'not_authenticated')))

    await apiClient.get('/plants').catch(() => {})

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not treat the signed-out answer from /auth/me as a lost session', async () => {
    const listener = vi.fn()
    unsubscribe = onUnauthorized(listener)
    server.use(http.get(apiPath('/auth/me'), () => errorResponse(401, 'not_authenticated')))

    await apiClient.get('/auth/me').catch(() => {})

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not treat a wrong password at sign-in as a lost session', async () => {
    const listener = vi.fn()
    unsubscribe = onUnauthorized(listener)
    server.use(http.post(apiPath('/auth/login'), () => errorResponse(401, 'invalid_credentials')))

    await apiClient.post('/auth/login', {}).catch(() => {})

    expect(listener).not.toHaveBeenCalled()
  })
})
