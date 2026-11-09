import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, specialist } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('Specialist workspace (US08)', () => {
  it('shows a specialist their review queue, empty until growers send cases', async () => {
    server.use(http.get(apiPath('/specialist/cases'), () => HttpResponse.json([])))
    renderApp('/specialist', { user: specialist })

    expect(await screen.findByRole('heading', { name: 'Review queue' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No cases waiting' })).toBeInTheDocument()
  })
})

describe('Navigation by role (FR03)', () => {
  it('gives growers their plant tools and no review queue', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([])))
    renderApp('/dashboard', { user: grower })

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(within(nav).getByRole('link', { name: 'New observation' })).toHaveAttribute(
      'href',
      '/observations/new',
    )
    expect(within(nav).queryByRole('link', { name: 'Review queue' })).not.toBeInTheDocument()
  })

  it('gives specialists the review queue and no plant tools', async () => {
    server.use(http.get(apiPath('/specialist/cases'), () => HttpResponse.json([])))
    renderApp('/specialist', { user: specialist })

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Review queue' })).toHaveAttribute(
      'href',
      '/specialist',
    )
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'New observation' })).not.toBeInTheDocument()
  })
})
