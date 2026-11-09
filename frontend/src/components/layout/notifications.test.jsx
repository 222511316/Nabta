import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makeAnalysis, makeNotification, makeObservation, makePest } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const question = makeNotification({ id: 31 })
const assessment = makeNotification({
  id: 30,
  kind: 'feedback_sent',
  plant_name: 'Fig tree',
  link: '/observations/4',
  read: true,
  created_at: '2026-09-19T10:00:00Z',
})

function dashboard() {
  return http.get(apiPath('/plants'), () => HttpResponse.json([]))
}

describe('Notifications (US13, FR15)', () => {
  it('shows how many are unread and lists them', async () => {
    server.use(
      dashboard(),
      http.get(apiPath('/notifications'), () => HttpResponse.json({ unread: 1, items: [question, assessment] })),
    )
    const { events } = renderApp('/dashboard', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))

    const items = await screen.findAllByRole('link', { name: /Lemon tree|Fig tree/ })
    expect(items[0]).toHaveTextContent('Khalid Alharbi asked you a question about Lemon tree')
    expect(items[0]).toHaveTextContent('Unread')
    expect(items[1]).toHaveTextContent('Khalid Alharbi sent an assessment for Fig tree')
    expect(items[1]).not.toHaveTextContent('Unread')
  })

  it('opens the case a notification is about and marks it read', async () => {
    let unread = 1
    const markedRead = []
    server.use(
      dashboard(),
      http.get(apiPath('/notifications'), () =>
        HttpResponse.json({ unread, items: [{ ...question, read: unread === 0 }] }),
      ),
      http.post(apiPath('/notifications/31/read'), () => {
        markedRead.push(31)
        unread = 0
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(apiPath('/observations/7'), () =>
        HttpResponse.json(makeObservation({ id: 7, analysis: makeAnalysis() })),
      ),
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
    )
    const { events } = renderApp('/dashboard', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    await events.click(await screen.findByRole('link', { name: /asked you a question about Lemon tree/ }))

    expect(await screen.findByRole('heading', { name: 'Observation from 20 September 2026' })).toBeInTheDocument()
    expect(markedRead).toEqual([31])
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('marks everything as read at once', async () => {
    let unread = 1
    server.use(
      dashboard(),
      http.get(apiPath('/notifications'), () =>
        HttpResponse.json({ unread, items: [{ ...question, read: unread === 0 }] }),
      ),
      http.post(apiPath('/notifications/read-all'), () => {
        unread = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { events } = renderApp('/dashboard', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    await events.click(await screen.findByRole('button', { name: 'Mark all as read' }))

    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument()
  })

  it('says when there is nothing to show', async () => {
    server.use(dashboard())
    const { events } = renderApp('/dashboard', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Notifications' }))

    const panel = await screen.findByText(/No notifications yet/)
    expect(within(panel.parentElement).queryByRole('link')).not.toBeInTheDocument()
  })
})
