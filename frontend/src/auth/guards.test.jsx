import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../test/api'
import { grower, specialist } from '../test/fixtures'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

const emptyPlants = http.get(apiPath('/plants'), () => HttpResponse.json([]))
const emptyCases = http.get(apiPath('/specialist/cases'), () => HttpResponse.json([]))

describe('route guards (US02, US08)', () => {
  it('sends a signed-out visitor to sign in', async () => {
    renderApp('/dashboard')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('opens the grower dashboard from the home page for a grower', async () => {
    server.use(emptyPlants)
    renderApp('/', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Your plants' })).toBeInTheDocument()
  })

  it('opens the review queue from the home page for a specialist', async () => {
    server.use(emptyCases)
    renderApp('/', { user: specialist })

    expect(await screen.findByRole('heading', { name: 'Review queue' })).toBeInTheDocument()
  })

  it('denies a grower the specialist workspace', async () => {
    renderApp('/specialist', { user: grower })

    expect(
      await screen.findByRole('heading', { name: "You don't have access to this page" }),
    ).toBeInTheDocument()
    expect(screen.getByText('This area is for plant specialists.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Review queue' })).not.toBeInTheDocument()
  })

  it('denies a specialist the grower pages', async () => {
    renderApp('/plants/new', { user: specialist })

    expect(
      await screen.findByRole('heading', { name: "You don't have access to this page" }),
    ).toBeInTheDocument()
    expect(screen.getByText('This area is for growers.')).toBeInTheDocument()
  })

  it('sends a signed-in user away from the sign-in page to their workspace', async () => {
    server.use(emptyPlants)
    renderApp('/sign-in', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Your plants' })).toBeInTheDocument()
  })

  it('returns to sign in with a notice when the session ends mid-visit', async () => {
    server.use(http.get(apiPath('/plants'), () => errorResponse(401, 'not_authenticated')))
    renderApp('/dashboard', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Your session has ended. Please sign in again.')).toBeInTheDocument()
  })

  it('offers a retry when the server cannot be reached to check the session', async () => {
    renderApp('/dashboard', {
      sessionHandler: http.get(apiPath('/auth/me'), () => HttpResponse.error()),
    })

    expect(await screen.findByRole('heading', { name: "Nabta isn't responding" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
