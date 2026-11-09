import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('Dashboard (US07)', () => {
  it("lists the grower's plants with a link to each profile", async () => {
    server.use(
      http.get(apiPath('/plants'), () =>
        HttpResponse.json([
          makePlant({
            id: 3,
            name: 'Lemon tree',
            observation_count: 2,
            last_observed_on: '2026-09-20',
            cover_photo_url: '/api/observations/7/photo?variant=thumb',
          }),
          makePlant({
            id: 4,
            name: 'Balcony tomatoes',
            plant_type: 'Tomato',
            location: 'Balcony planter',
          }),
        ]),
      ),
    )
    renderApp('/dashboard', { user: grower })
    const main = await screen.findByRole('main')

    expect(await within(main).findByRole('link', { name: 'Lemon tree' })).toHaveAttribute(
      'href',
      '/plants/3',
    )
    expect(within(main).getByRole('link', { name: 'Balcony tomatoes' })).toHaveAttribute(
      'href',
      '/plants/4',
    )
    expect(within(main).getByText('2 observations')).toBeInTheDocument()
    expect(within(main).getByText('Last seen 20 September 2026')).toBeInTheDocument()
    expect(within(main).getByText('No observations yet')).toBeInTheDocument()
    expect(within(main).getByText('Tomato · Balcony planter')).toBeInTheDocument()
    expect(
      within(main).getByRole('img', { name: 'Latest insect photo from Lemon tree' }),
    ).toHaveAttribute('src', '/api/observations/7/photo?variant=thumb')
    expect(within(main).getByRole('link', { name: 'New observation' })).toHaveAttribute(
      'href',
      '/observations/new',
    )
  })

  it('greets the grower and sums up their records', async () => {
    server.use(
      http.get(apiPath('/plants'), () =>
        HttpResponse.json([
          makePlant({ id: 3, observation_count: 2, last_observed_on: '2026-09-20' }),
          makePlant({ id: 4, name: 'Balcony tomatoes', observation_count: 1, last_observed_on: '2026-09-18' }),
        ]),
      ),
    )
    renderApp('/dashboard', { user: grower })

    expect(
      await screen.findByText("You're keeping records for 2 plants, with 3 observations so far.", {
        exact: false,
      }),
    ).toHaveTextContent(/^Good (morning|afternoon|evening), Sara\./)
  })

  it('invites a new grower to add their first plant', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([])))
    renderApp('/dashboard', { user: grower })
    const main = await screen.findByRole('main')

    expect(
      await within(main).findByRole('heading', { name: 'Add your first plant' }),
    ).toBeInTheDocument()
    const addPlantHrefs = within(main)
      .getAllByRole('link', { name: 'Add plant' })
      .map((link) => link.getAttribute('href'))
    expect(addPlantHrefs).toEqual(['/plants/new'])
    // With no plants there is nothing to record an observation against yet.
    expect(within(main).queryByRole('link', { name: 'New observation' })).not.toBeInTheDocument()
  })

  it('offers to retry when the plants cannot be loaded', async () => {
    let attempts = 0
    server.use(
      http.get(apiPath('/plants'), () => {
        attempts += 1
        return attempts === 1 ? errorResponse(500, 'server_error') : HttpResponse.json([])
      }),
    )
    const { events } = renderApp('/dashboard', { user: grower })

    expect(await screen.findByRole('alert')).toHaveTextContent("Your plants couldn't be loaded.")
    await events.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Add your first plant' })).toBeInTheDocument()
  })
})
