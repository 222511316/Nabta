import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const summary = (counts) =>
  http.get(apiPath('/summary'), () =>
    HttpResponse.json({
      tasks_overdue: 0,
      tasks_due_today: 0,
      reviews_waiting_for_you: 0,
      unclear_not_reviewed: 0,
      open_tasks: 0,
      ...counts,
    }),
  )

describe('Needs attention on the dashboard (US21)', () => {
  it('lists what needs the grower today, each linking to the records', async () => {
    let sentToday
    server.use(
      http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])),
      http.get(apiPath('/summary'), ({ request }) => {
        sentToday = new URL(request.url).searchParams.get('today')
        return HttpResponse.json({
          tasks_overdue: 2,
          tasks_due_today: 1,
          reviews_waiting_for_you: 1,
          unclear_not_reviewed: 3,
          open_tasks: 5,
        })
      }),
    )
    renderApp('/dashboard', { user: grower })

    const panel = await screen.findByRole('region', { name: 'Needs attention' })
    expect(within(panel).getByRole('link', { name: '2 tasks overdue' })).toHaveAttribute('href', '/tasks')
    expect(within(panel).getByRole('link', { name: '1 task due today' })).toHaveAttribute('href', '/tasks')
    expect(within(panel).getByRole('link', { name: '1 review waiting for your reply' })).toHaveAttribute('href', '/reviews')
    expect(within(panel).getByRole('link', { name: '3 unclear results to check' })).toHaveAttribute(
      'href',
      '/search?type=observations&result=unclear',
    )
    expect(sentToday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('stays quiet when nothing needs attention', async () => {
    server.use(
      http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])),
      summary({ open_tasks: 2 }),
    )
    renderApp('/dashboard', { user: grower })

    expect(await screen.findByText('Nothing needs your attention today.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2 open tasks' })).toHaveAttribute('href', '/tasks')
    expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument()
  })
})
