import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makeAnalysis, makeObservation, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const observations = [
  // Newest first, as the API lists them.
  makeObservation({ id: 9, observed_on: '2026-10-02', notes: 'Fewer now', analysis: makeAnalysis() }),
  makeObservation({ id: 8, observed_on: '2026-09-26', notes: 'Spreading' }),
  makeObservation({ id: 7, observed_on: '2026-09-20', notes: 'First sighting', analysis: makeAnalysis({ outcome: 'unclear' }) }),
]

function plantWith(list) {
  return [
    http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant({ observation_count: list.length }))),
    http.get(apiPath('/plants/3/observations'), () => HttpResponse.json(list)),
  ]
}

describe('Comparing photos over time (US20)', () => {
  it('starts with the oldest and newest photos, and says how far apart they are', async () => {
    server.use(...plantWith(observations))
    renderApp('/plants/3/compare', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Compare photos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '20 September 2026' })).toHaveAttribute('href', '/observations/7')
    expect(screen.getByRole('link', { name: '2 October 2026' })).toHaveAttribute('href', '/observations/9')
    expect(screen.getByText('12 days apart')).toBeInTheDocument()
    expect(screen.getByText('Unclear')).toBeInTheDocument()
    expect(screen.getAllByText('Aphids').length).toBeGreaterThan(0)
  })

  it('puts the photo picked on the date ribbon in the slot being changed', async () => {
    server.use(...plantWith(observations))
    const { events } = renderApp('/plants/3/compare', { user: grower })

    const ribbon = await screen.findByRole('group', { name: 'Photos by date' })
    expect(within(ribbon).getByRole('button', { name: /20 September 2026, Unclear, photo A/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Photo B is the one being changed until the grower picks A.
    await events.click(within(ribbon).getByRole('button', { name: /26 September 2026/ }))
    expect(await screen.findByText('6 days apart')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '26 September 2026' })).toBeInTheDocument()

    await events.click(screen.getByRole('button', { name: 'Photo A' }))
    await events.click(within(ribbon).getByRole('button', { name: /2 October 2026/ }))
    expect(await screen.findByText('6 days apart')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '20 September 2026' })).not.toBeInTheDocument()
  })

  it('asks for another photo when there is only one', async () => {
    server.use(...plantWith(observations.slice(0, 1)))
    renderApp('/plants/3/compare', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Two photos are needed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add observation' })).toHaveAttribute('href', '/observations/new?plantId=3')
  })

  it('is offered on the plant page once there are two photos', async () => {
    server.use(...plantWith(observations))
    renderApp('/plants/3', { user: grower })

    expect(await screen.findByRole('link', { name: 'Compare photos' })).toHaveAttribute('href', '/plants/3/compare')
  })
})
