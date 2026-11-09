import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import {
  grower,
  makeAnalysis,
  makeObservation,
  makePest,
  makePestSummary,
  makePlant,
  makeSpecialistCase,
  specialist,
} from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const aiOn = http.get(apiPath('/ai'), () => HttpResponse.json({ enabled: true, model: 'gpt-6-luna' }))
const lemon = makePlant({ id: 3, name: 'Lemon tree' })

const report = {
  summary: 'Aphids were found twice on this lemon tree; a specialist confirmed them.',
  timeline: [
    { date: '2026-09-20', text: 'Green insects under the new leaves; Nabta suggested aphids.' },
    { date: '2026-10-02', text: 'More aphids; the specialist agreed.' },
  ],
  open_items: [],
  next_steps: [{ text: 'Check the soft new growth each week.', pest: { key: 'aphids', name: 'Aphids' } }],
  model: 'gpt-6-luna',
  created_at: '2026-10-18T10:00:00Z',
}

describe('Plant report', () => {
  it('writes a report on request, after saying what is sent to OpenAI', async () => {
    let written = 0
    server.use(
      aiOn,
      http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)),
      http.get(apiPath('/plants/3/report'), () => errorResponse(404, 'not_found')),
      http.post(apiPath('/plants/3/report'), () => {
        written += 1
        return HttpResponse.json(report, { status: 201 })
      }),
    )
    const { events } = renderApp('/plants/3/report', { user: grower })

    expect(await screen.findByRole('heading', { name: 'No report yet' })).toBeInTheDocument()
    expect(screen.getByText(/sent to OpenAI to write it\. Photos and your name are not sent\./)).toBeInTheDocument()
    await events.click(screen.getByRole('button', { name: 'Write report' }))

    expect(await screen.findByText(report.summary)).toBeInTheDocument()
    const timeline = screen.getByRole('region', { name: 'What happened' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(2)
    expect(within(timeline).getByText('20 September 2026')).toBeInTheDocument()
    expect(screen.getByText('Nothing is waiting.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'From the Aphids guide' })).toHaveAttribute('href', '/pests/aphids')
    expect(screen.getByText(/Written by AI \(gpt-6-luna\)\. It can be wrong/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(written).toBe(1)
  })

  it('shows the saved report without writing a new one', async () => {
    let written = 0
    server.use(
      aiOn,
      http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)),
      http.get(apiPath('/plants/3/report'), () => HttpResponse.json(report)),
      http.post(apiPath('/plants/3/report'), () => {
        written += 1
        return HttpResponse.json(report, { status: 201 })
      }),
    )
    renderApp('/plants/3/report', { user: grower })

    expect(await screen.findByText(report.summary)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write a new report' })).toBeInTheDocument()
    expect(written).toBe(0)
  })

  it('offers to try again when the AI fails', async () => {
    server.use(
      aiOn,
      http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)),
      http.get(apiPath('/plants/3/report'), () => errorResponse(404, 'not_found')),
      http.post(apiPath('/plants/3/report'), () => errorResponse(503, 'ai_failed')),
    )
    const { events } = renderApp('/plants/3/report', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Write report' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("The report wasn't written")
    expect(alert).toHaveTextContent("The AI couldn't write this right now. Try again.")
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('stays out of the way when AI is not set up', async () => {
    server.use(
      http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    )
    renderApp('/plants/3', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Lemon tree' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Plant report' })).not.toBeInTheDocument()
  })

  it('is linked from the plant page when AI is on', async () => {
    server.use(
      aiOn,
      http.get(apiPath('/plants/3'), () => HttpResponse.json(lemon)),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    )
    renderApp('/plants/3', { user: grower })

    expect(await screen.findByRole('link', { name: 'Plant report' })).toHaveAttribute('href', '/plants/3/report')
  })
})

describe('Draft with AI (specialists)', () => {
  it('drafts a message that follows the chosen outcome, and only uses it when asked', async () => {
    let asked
    let assessed = false
    server.use(
      aiOn,
      http.get(apiPath('/specialist/cases/12'), () => HttpResponse.json(makeSpecialistCase({ assigned_to_me: true }))),
      http.get(apiPath('/pests'), () => HttpResponse.json([makePestSummary('aphids')])),
      http.post(apiPath('/specialist/cases/12/draft'), async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json({ message: 'These look like aphids on the new growth.', model: 'gpt-6-luna' })
      }),
      http.post(apiPath('/specialist/cases/12/feedback'), () => {
        assessed = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const { events } = renderApp('/specialist/cases/12', { user: specialist })
    const form = await screen.findByRole('region', { name: 'Your assessment' })

    await events.click(within(form).getByLabelText('Agree with Nabta: Aphids'))
    await events.click(within(form).getByRole('button', { name: 'Draft with AI' }))

    const draft = await within(form).findByRole('region', { name: 'AI draft' })
    expect(asked).toEqual({ outcome: 'identified', category_key: 'aphids', other_pest: null })
    expect(within(draft).getByText('These look like aphids on the new growth.')).toBeInTheDocument()
    expect(within(form).getByLabelText(/Message to the grower/)).toHaveValue('')

    await events.click(within(draft).getByRole('button', { name: 'Use this draft' }))

    expect(within(form).getByLabelText(/Message to the grower/)).toHaveValue('These look like aphids on the new growth.')
    expect(within(form).queryByRole('region', { name: 'AI draft' })).not.toBeInTheDocument()
    expect(assessed).toBe(false)
  })
})

describe('Ask about this pest', () => {
  it("answers from the page's guide, with the plant's context when opened from an observation", async () => {
    let asked
    server.use(
      aiOn,
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
      http.get(apiPath('/observations/7'), () => HttpResponse.json(makeObservation({ id: 7, analysis: makeAnalysis() }))),
      http.post(apiPath('/pests/aphids/questions'), async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json({
          answer: "The guide doesn't say how to treat them.",
          covered_by_guide: false,
          suggest_specialist: true,
          model: 'gpt-6-luna',
        })
      }),
    )
    const { events } = renderApp('/pests/aphids?observation=7', { user: grower })
    const box = await screen.findByRole('region', { name: 'Ask about Aphids' })

    await events.type(within(box).getByLabelText('Your question'), '  What should I spray?  ')
    await events.click(within(box).getByRole('button', { name: 'Ask' }))

    expect(await within(box).findByText("The guide doesn't say how to treat them.")).toBeInTheDocument()
    expect(asked).toEqual({ question: 'What should I spray?', observation_id: 7 })
    expect(within(box).getByText("This page's guide doesn't cover that.")).toBeInTheDocument()
    expect(within(box).getByText('A plant specialist can help with this.')).toBeInTheDocument()
    expect(within(box).getByText(/Written by AI \(gpt-6-luna\)/)).toBeInTheDocument()
    expect(within(box).getByLabelText('Your question')).toHaveValue('')
  })

  it('is hidden when AI is not set up', async () => {
    server.use(http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())))
    renderApp('/pests/aphids', { user: grower })

    expect(await screen.findByRole('heading', { level: 1, name: 'Aphids' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Ask about/ })).not.toBeInTheDocument()
  })
})
