import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makePlant, makeTask } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const results = {
  plants: [{ id: 3, name: 'Lemon tree', plant_type: 'Lemon', location: 'Back garden' }],
  observations: [
    {
      id: 7,
      plant_id: 3,
      plant_name: 'Lemon tree',
      observed_on: '2026-09-20',
      notes: 'Green insects on the lemon leaves',
      thumb_url: '/api/observations/7/photo?variant=thumb',
      result: { outcome: 'identified', pest: { key: 'aphids', name: 'Aphids' } },
      review_status: 'answered',
    },
  ],
  tasks: [makeTask({ title: 'Rinse the lemon leaves' })],
  notes: [{ id: 31, plant_id: 3, plant_name: 'Lemon tree', noted_on: '2026-09-21', body: 'Fed the lemon.' }],
}

function searchApi(requests) {
  return http.get(apiPath('/search'), ({ request }) => {
    const params = Object.fromEntries(new URL(request.url).searchParams)
    requests.push(params)
    if (params.type === 'tasks') return HttpResponse.json({ plants: [], observations: [], tasks: results.tasks, notes: [] })
    return HttpResponse.json(params.q === 'zzz' ? { plants: [], observations: [], tasks: [], notes: [] } : results)
  })
}

describe('Search (US21)', () => {
  it('searches as the grower types and groups what it finds', async () => {
    const requests = []
    server.use(searchApi(requests))
    const { events } = renderApp('/search', { user: grower })

    expect(await screen.findByText('Type to search, or choose what to show.')).toBeInTheDocument()
    await events.type(screen.getByRole('searchbox', { name: 'Search your records' }), 'lemon')

    const photos = await screen.findByRole('region', { name: 'Photos (1)' })
    expect(within(photos).getByRole('link', { name: /Lemon tree, 20 September 2026/ })).toHaveAttribute('href', '/observations/7')
    expect(within(photos).getByText('Aphids')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Plants (1)' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tasks (1)' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Notes (1)' })).getByRole('link')).toHaveAttribute(
      'href',
      '/plants/3?tab=notes',
    )
    // The words that matched are marked.
    expect(within(photos).getAllByText('lemon', { selector: 'mark' }).length).toBeGreaterThan(0)
    expect(requests.at(-1)).toEqual({ q: 'lemon', type: 'all' })
  })

  it('narrows the results with filters', async () => {
    const requests = []
    server.use(searchApi(requests))
    const { events } = renderApp('/search?q=lemon', { user: grower })

    await screen.findByRole('region', { name: 'Photos (1)' })
    await events.click(screen.getByRole('button', { name: 'Tasks' }))
    await events.click(await screen.findByRole('button', { name: 'Open' }))

    await expect.poll(() => requests.at(-1)).toEqual({ q: 'lemon', type: 'tasks', task_status: 'open' })
    expect(await screen.findByRole('region', { name: 'Tasks (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Photos/ })).not.toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    server.use(searchApi([]))
    renderApp('/search?q=zzz', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Nothing found for “zzz”' })).toBeInTheDocument()
  })

  it('is one tap away in the header', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])))
    renderApp('/dashboard', { user: grower })

    expect(await screen.findByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search')
  })
})
