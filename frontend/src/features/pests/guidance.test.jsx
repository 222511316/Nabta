import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makeAnalysis, makeObservation, makePest, makePlant, specialist } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('What you can do (US17)', () => {
  it('lists practical steps by kind, with a word about pesticides', async () => {
    server.use(http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())))
    renderApp('/pests/aphids', { user: grower })

    const guidance = await screen.findByRole('region', { name: 'What you can do' })
    expect(within(guidance).getByRole('heading', { name: 'Hose aphids off with water' })).toBeInTheDocument()
    expect(within(guidance).getByText('Protect natural enemies')).toBeInTheDocument()
    expect(guidance).toHaveTextContent('Thinking of using a pesticide? Ask a plant specialist first.')
    expect(within(guidance).getAllByRole('button', { name: 'Add as a task' })).toHaveLength(3)
  })

  it('turns a step into a task on the plant the photo came from', async () => {
    let created
    let createdOn
    server.use(
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
      http.get(apiPath('/observations/7'), () => HttpResponse.json(makeObservation({ analysis: makeAnalysis() }))),
      http.get(apiPath('/plants'), () => HttpResponse.json([makePlant(), makePlant({ id: 4, name: 'Fig tree' })])),
      http.post(apiPath('/plants/:plantId/tasks'), async ({ request, params }) => {
        created = await request.json()
        createdOn = params.plantId
        return HttpResponse.json({ id: 1, plant_name: 'Lemon tree' }, { status: 201 })
      }),
    )
    const { events } = renderApp('/pests/aphids?observation=7', { user: grower })

    const guidance = await screen.findByRole('region', { name: 'What you can do' })
    await screen.findByText('Your photo')
    await events.click(within(guidance).getAllByRole('button', { name: 'Add as a task' })[1])
    const dialog = await screen.findByRole('dialog', { name: 'Add a task' })
    expect(within(dialog).getByLabelText('Task')).toHaveValue('Hose aphids off with water')
    await expect.poll(() => within(dialog).getByLabelText('Plant').value).toBe('3')
    await events.click(within(dialog).getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Task added to Lemon tree.')).toBeInTheDocument()
    expect(createdOn).toBe('3')
    expect(created).toEqual({
      title: 'Hose aphids off with water',
      due_on: null,
      notes: null,
      observation_id: 7,
      pest_key: 'aphids',
    })
  })

  it('is read-only for specialists', async () => {
    server.use(http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())))
    renderApp('/pests/aphids', { user: specialist })

    const guidance = await screen.findByRole('region', { name: 'What you can do' })
    expect(within(guidance).queryByRole('button', { name: 'Add as a task' })).not.toBeInTheDocument()
  })

  it('is linked from an identified result', async () => {
    server.use(
      http.get(apiPath('/observations/7'), () => HttpResponse.json(makeObservation({ analysis: makeAnalysis() }))),
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
    )
    renderApp('/observations/7', { user: grower })

    expect(await screen.findByRole('link', { name: 'What you can do about Aphids' })).toHaveAttribute(
      'href',
      '/pests/aphids?observation=7#guidance',
    )
  })
})
