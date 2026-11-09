import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../test/api'
import { grower, makeNotification, makePlant } from '../test/fixtures'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('Arabic and English (US23)', () => {
  it('switches to Arabic in place: right to left, same page, remembered, and asked of the server', async () => {
    const languages = []
    server.use(
      http.get(apiPath('/plants/3'), ({ request }) => {
        languages.push(request.headers.get('accept-language'))
        return HttpResponse.json(makePlant())
      }),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
      http.get(apiPath('/plants/3/notes'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/plants/3?tab=notes', { user: grower })
    await screen.findByRole('heading', { name: 'Lemon tree' })
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')

    await events.click(screen.getByRole('button', { name: 'العربية' }))

    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(localStorage.getItem('nabta.language')).toBe('ar')
    // Still on the same plant, on the same tab.
    expect(await screen.findByRole('heading', { name: 'Lemon tree' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('الملاحظات')
    await expect.poll(() => languages.at(-1)).toBe('ar')

    await events.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
    expect(await screen.findByRole('tab', { name: 'Notes', selected: true })).toBeInTheDocument()
  })

  it('is offered before signing in', async () => {
    renderApp('/sign-in')

    expect(await screen.findByRole('button', { name: 'العربية' })).toBeInTheDocument()
  })
})

describe('Task reminders in the bell (US18)', () => {
  it("send the grower's own date and open the plant's tasks", async () => {
    let sentToday
    server.use(
      http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])),
      http.get(apiPath('/notifications'), ({ request }) => {
        sentToday = new URL(request.url).searchParams.get('today')
        return HttpResponse.json({
          unread: 1,
          items: [
            makeNotification({
              id: 40,
              kind: 'task_due',
              case_id: null,
              task_id: 21,
              task_title: 'Rinse the leaves',
              actor_name: '',
              link: '/plants/3?tab=tasks',
            }),
          ],
        })
      }),
    )
    const { events } = renderApp('/dashboard', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))

    expect(await screen.findByRole('link', { name: /Due: Rinse the leaves, on Lemon tree/ })).toHaveAttribute(
      'href',
      '/plants/3?tab=tasks',
    )
    expect(sentToday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
