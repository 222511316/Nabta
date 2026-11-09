import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makePest, makePestSummary, makePlant, makeSpecialistCase, specialist } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

// Supervisor review OBS-06: the assessed release runs without an OpenAI key, so GET /api/ai answers
// { enabled: false } (the default handler in test/server.js). No AI control may appear, and no AI
// endpoint may be called: every request must match a handler declared here, or the test fails.

const aiOffExplicitly = http.get(apiPath('/ai'), () => HttpResponse.json({ enabled: false, model: null }))
const lemon = makePlant({ id: 3, name: 'Lemon tree', observation_count: 0 })

describe('AI features are off', () => {
  it('the plant page has no plant report entry, in its menu or anywhere else', async () => {
    server.use(
      aiOffExplicitly,
      http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/plants/3', { user: grower })
    await screen.findByRole('heading', { level: 1, name: 'Lemon tree' })

    await events.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Plant report' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Plant report|AI/)).not.toBeInTheDocument()
  })

  it('the pest page has no "Ask about this pest"', async () => {
    server.use(aiOffExplicitly, http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())))
    renderApp('/pests/aphids', { user: grower })

    expect(await screen.findByRole('heading', { level: 1, name: 'Aphids' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Ask about/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Your question')).not.toBeInTheDocument()
  })

  it('the specialist case page has no "Draft with AI"', async () => {
    server.use(
      aiOffExplicitly,
      http.get(apiPath('/specialist/cases/12'), () => HttpResponse.json(makeSpecialistCase({ assigned_to_me: true }))),
      http.get(apiPath('/pests'), () => HttpResponse.json([makePestSummary('aphids')])),
    )
    renderApp('/specialist/cases/12', { user: specialist })

    const form = await screen.findByRole('region', { name: 'Your assessment' })
    expect(within(form).queryByRole('button', { name: 'Draft with AI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument()
  })

  it("opening the report page directly calls no AI endpoint and says reports aren't available", async () => {
    server.use(aiOffExplicitly, http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)))
    renderApp('/plants/3/report', { user: grower })

    expect(await screen.findByRole('heading', { level: 1, name: "Plant reports aren't available" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Write report' })).not.toBeInTheDocument()
  })

  it('stays off when the status check fails', async () => {
    server.use(
      http.get(apiPath('/ai'), () => HttpResponse.json({ code: 'server_error', message: 'x' }, { status: 500 })),
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
    )
    renderApp('/pests/aphids', { user: grower })

    expect(await screen.findByRole('heading', { level: 1, name: 'Aphids' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Ask about/ })).not.toBeInTheDocument()
  })
})
