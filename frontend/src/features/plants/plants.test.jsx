import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower, makeObservation, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

/** A tiny in-memory plant store so reads after a write see the change. */
function plantStore(initial, { onPatch = () => {} } = {}) {
  let plant = initial
  return [
    http.get(apiPath(`/plants/${plant.id}`), () => HttpResponse.json(plant)),
    http.get(apiPath(`/plants/${plant.id}/observations`), () => HttpResponse.json([])),
    http.patch(apiPath(`/plants/${plant.id}`), async ({ request }) => {
      const changes = await request.json()
      onPatch(changes)
      plant = { ...plant, ...changes, updated_at: '2026-09-23T12:00:00Z' }
      return HttpResponse.json(plant)
    }),
  ]
}

describe('Plant profiles (US05)', () => {
  it('adds a plant and opens its profile', async () => {
    let sentBody
    const created = makePlant({
      id: 9,
      name: 'Balcony tomatoes',
      plant_type: 'Tomato',
      location: 'Balcony planter',
    })
    server.use(
      http.post(apiPath('/plants'), async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json(created, { status: 201 })
      }),
      ...plantStore(created),
    )
    const { events } = renderApp('/plants/new', { user: grower })

    await events.type(await screen.findByLabelText('Plant name'), 'Balcony tomatoes')
    await events.type(screen.getByLabelText(/Type of plant/), 'Tomato')
    await events.type(screen.getByLabelText(/Location/), 'Balcony planter')
    await events.click(screen.getByRole('button', { name: 'Add plant' }))

    expect(await screen.findByRole('heading', { name: 'Balcony tomatoes' })).toBeInTheDocument()
    expect(await screen.findByText('Balcony tomatoes was added.')).toBeInTheDocument()
    expect(sentBody).toEqual({
      name: 'Balcony tomatoes',
      plant_type: 'Tomato',
      location: 'Balcony planter',
      notes: null,
    })
  })

  it('needs a name before the plant can be saved', async () => {
    let createCalled = false
    server.use(
      http.post(apiPath('/plants'), () => {
        createCalled = true
        return HttpResponse.json(makePlant(), { status: 201 })
      }),
    )
    const { events } = renderApp('/plants/new', { user: grower })

    await events.type(await screen.findByLabelText('Plant name'), '   ')
    await events.click(screen.getByRole('button', { name: 'Add plant' }))

    expect(screen.getByLabelText('Plant name')).toHaveAccessibleDescription(
      expect.stringContaining('This field is required.'),
    )
    expect(createCalled).toBe(false)
  })

  it("shows a plant's details and its observation history, newest first", async () => {
    server.use(
      http.get(apiPath('/plants/3'), () =>
        HttpResponse.json(
          makePlant({ observation_count: 2, notes: 'Planted in spring 2024' }),
        ),
      ),
      http.get(apiPath('/plants/3/observations'), () =>
        HttpResponse.json([
          makeObservation({ id: 8, observed_on: '2026-09-20' }),
          makeObservation({ id: 7, observed_on: '2026-09-12', notes: null }),
        ]),
      ),
    )
    renderApp('/plants/3', { user: grower })
    const main = await screen.findByRole('main')

    expect(await within(main).findByRole('heading', { name: 'Lemon tree' })).toBeInTheDocument()
    expect(within(main).getByText('Planted in spring 2024')).toBeInTheDocument()
    const observationLinks = await within(main).findAllByRole('link', { name: /September 2026/ })
    expect(observationLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/observations/8',
      '/observations/7',
    ])
    expect(within(main).getByRole('link', { name: 'Add observation' })).toHaveAttribute(
      'href',
      '/observations/new?plantId=3',
    )
  })

  it('edits a plant and shows the saved details', async () => {
    let sentBody
    server.use(...plantStore(makePlant(), { onPatch: (changes) => (sentBody = changes) }))
    const { events } = renderApp('/plants/3/edit', { user: grower })

    const name = await screen.findByLabelText('Plant name')
    await expect.poll(() => name.value).toBe('Lemon tree')
    await events.clear(name)
    await events.type(name, 'Lemon tree by the gate')
    await events.clear(screen.getByLabelText(/Location/))
    await events.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByRole('heading', { name: 'Lemon tree by the gate' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Your changes were saved.')).toBeInTheDocument()
    expect(sentBody).toEqual({
      name: 'Lemon tree by the gate',
      plant_type: 'Lemon',
      location: null,
      notes: null,
    })
  })

  it('deletes a plant only after the grower confirms', async () => {
    let deleteCalls = 0
    server.use(
      http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant({ observation_count: 2 }))),
      http.get(apiPath('/plants/3/observations'), () =>
        HttpResponse.json([makeObservation({ id: 8 }), makeObservation({ id: 7 })]),
      ),
      http.delete(apiPath('/plants/3'), () => {
        deleteCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(apiPath('/plants'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/plants/3', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Delete' }))
    let dialog = await screen.findByRole('dialog', { name: 'Delete Lemon tree?' })
    expect(dialog).toHaveTextContent(
      "This permanently deletes the plant and its 2 observations, including their photos. This can't be undone.",
    )
    await events.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull()
    expect(deleteCalls).toBe(0)

    await events.click(screen.getByRole('button', { name: 'Delete' }))
    dialog = await screen.findByRole('dialog', { name: 'Delete Lemon tree?' })
    await events.click(within(dialog).getByRole('button', { name: 'Delete plant' }))

    expect(await screen.findByRole('heading', { name: 'Add your first plant' })).toBeInTheDocument()
    expect(await screen.findByText('Lemon tree was deleted.')).toBeInTheDocument()
    expect(deleteCalls).toBe(1)
  })

  it('does not ask the server for the deleted plant again after deleting it', async () => {
    let deleted = false
    const requestsAfterDelete = []
    const track = (label, response) => () => {
      if (deleted) requestsAfterDelete.push(label)
      return response()
    }
    server.use(
      http.get(
        apiPath('/plants/3'),
        track('plant', () => HttpResponse.json(makePlant({ observation_count: 1 }))),
      ),
      http.get(
        apiPath('/plants/3/observations'),
        track('observations', () => HttpResponse.json([makeObservation({ id: 8 })])),
      ),
      http.delete(apiPath('/plants/3'), () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(apiPath('/plants'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/plants/3', { user: grower })
    await screen.findByRole('link', { name: /September 2026/ })

    await events.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Lemon tree?' })
    await events.click(within(dialog).getByRole('button', { name: 'Delete plant' }))
    await screen.findByRole('heading', { name: 'Add your first plant' })

    expect(requestsAfterDelete).toEqual([])
  })

  it("says so when a plant isn't in the grower's account", async () => {
    server.use(
      http.get(apiPath('/plants/99'), () => errorResponse(404, 'not_found')),
      http.get(apiPath('/plants/99/observations'), () => errorResponse(404, 'not_found')),
    )
    renderApp('/plants/99', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Plant not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })
})
