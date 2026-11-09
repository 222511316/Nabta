import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import {
  grower,
  makeAnalysis,
  makeFeedback,
  makeGrowerCase,
  makeMessage,
  makeObservation,
  makePest,
} from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const analysed = makeObservation({ id: 7, analysis: makeAnalysis() })

function observationHandlers(observation, reviewCase) {
  return [
    http.get(apiPath('/observations/7'), () => HttpResponse.json(observation)),
    http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
    ...(reviewCase ? [http.get(apiPath('/observations/7/review'), () => HttpResponse.json(reviewCase))] : []),
  ]
}

describe('Asking a specialist (US12)', () => {
  it('lists what the specialist will see, then sends the request with a note', async () => {
    let sent
    server.use(
      ...observationHandlers(analysed),
      http.post(apiPath('/observations/7/review'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(makeGrowerCase({ note: sent.note }), { status: 201 })
      }),
    )
    const { events } = renderApp('/observations/7', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Ask a specialist' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ask a specialist to review this?' })
    const shared = within(dialog).getAllByRole('listitem').map((item) => item.textContent)
    expect(shared).toEqual([
      'This photo and the date you saw the insect',
      "Nabta's suggestion: Aphids, 92%",
      'Your notes on this observation',
      "Your plant's name, type and location",
      'Your name',
    ])
    await events.type(within(dialog).getByLabelText(/Anything else the specialist should know/), 'They keep coming back.')
    await events.click(within(dialog).getByRole('button', { name: 'Send to a specialist' }))

    expect(await screen.findByText('Sent to a specialist.')).toBeInTheDocument()
    expect(sent).toEqual({ note: 'They keep coming back.' })
    const review = await screen.findByRole('region', { name: 'Specialist review' })
    expect(within(review).getByText('Waiting for a specialist')).toBeInTheDocument()
    expect(within(review).getByText('They keep coming back.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask a specialist' })).not.toBeInTheDocument()
  })

  it('sends no note when the grower leaves it blank', async () => {
    let sent
    server.use(
      ...observationHandlers(analysed),
      http.post(apiPath('/observations/7/review'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(makeGrowerCase({ note: null }), { status: 201 })
      }),
    )
    const { events } = renderApp('/observations/7', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Ask a specialist' }))
    await events.click(await screen.findByRole('button', { name: 'Send to a specialist' }))

    expect(await screen.findByText('Sent without a note.')).toBeInTheDocument()
    expect(sent).toEqual({ note: null })
  })
})

describe('Following a review (US13, US15)', () => {
  it("shows the specialist's question and lets the grower reply", async () => {
    const question = makeMessage({ id: 1, body: 'Are they on the young leaves?' })
    const waiting = makeGrowerCase({
      status: 'waiting_for_grower',
      specialist_name: 'Khalid Alharbi',
      messages: [question],
    })
    let reply
    server.use(
      ...observationHandlers({ ...analysed, review_status: 'waiting_for_grower' }, waiting),
      http.post(apiPath('/reviews/12/replies'), async ({ request }) => {
        reply = await request.json()
        return HttpResponse.json(
          makeGrowerCase({
            status: 'waiting_for_specialist',
            specialist_name: 'Khalid Alharbi',
            messages: [
              question,
              makeMessage({ id: 2, kind: 'reply', body: reply.body, author_name: 'Sara Ahmed' }),
            ],
          }),
          { status: 201 },
        )
      }),
    )
    const { events } = renderApp('/observations/7', { user: grower })

    const review = await screen.findByRole('region', { name: 'Specialist review' })
    expect(await within(review).findByText('Waiting for your reply')).toBeInTheDocument()
    expect(within(review).getByText('Are they on the young leaves?')).toBeInTheDocument()
    expect(within(review).getByText('Khalid Alharbi')).toBeInTheDocument()

    await events.type(within(review).getByLabelText('Your reply'), 'Yes, only the young ones.')
    await events.click(within(review).getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText('Reply sent.')).toBeInTheDocument()
    expect(reply).toEqual({ body: 'Yes, only the young ones.' })
    expect(within(review).getByText('Yes, only the young ones.')).toBeInTheDocument()
    expect(within(review).getAllByText('Sara Ahmed (you)')).toHaveLength(2) // the request and the reply
    expect(within(review).getByText('Waiting for a specialist')).toBeInTheDocument()
    expect(within(review).getByText('Khalid Alharbi is reviewing your case.')).toBeInTheDocument()
    expect(within(review).queryByLabelText('Your reply')).not.toBeInTheDocument()
  })

  it("shows the specialist's assessment apart from Nabta's suggestion (US16)", async () => {
    const answered = makeGrowerCase({
      status: 'answered',
      specialist_name: 'Khalid Alharbi',
      feedback: makeFeedback(),
    })
    server.use(...observationHandlers({ ...analysed, review_status: 'answered' }, answered))
    renderApp('/observations/7', { user: grower })

    const assessment = await screen.findByRole('region', { name: "Specialist's assessment" })
    expect(within(assessment).getByText('Agrees with Nabta: Aphids')).toBeInTheDocument()
    expect(within(assessment).getByText(/Rinse them off/)).toBeInTheDocument()
    expect(within(assessment).getByText('Khalid Alharbi, 22 September 2026')).toBeInTheDocument()
    const suggestion = screen.getByRole('region', { name: "Nabta's suggestion" })
    expect(suggestion).not.toContainElement(assessment)
    expect(screen.getByText('Answered')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your reply')).not.toBeInTheDocument()
  })

  it('names a different pest, or says the photo was not enough', async () => {
    const answered = makeGrowerCase({
      status: 'answered',
      feedback: makeFeedback({ category: null, other_pest: 'Leafhoppers', matches_suggestion: false }),
    })
    server.use(...observationHandlers({ ...analysed, review_status: 'answered' }, answered))
    renderApp('/observations/7', { user: grower })

    expect(await screen.findByText('Identified as Leafhoppers')).toBeInTheDocument()
  })
})

describe('The grower’s reviews page (US13)', () => {
  it('lists every review with where it stands', async () => {
    server.use(
      http.get(apiPath('/reviews'), () =>
        HttpResponse.json([
          {
            id: 12,
            observation_id: 7,
            status: 'waiting_for_grower',
            plant_name: 'Lemon tree',
            observed_on: '2026-09-20',
            thumb_url: '/api/observations/7/photo?variant=thumb',
            updated_at: '2026-09-21T10:00:00Z',
          },
          {
            id: 9,
            observation_id: 4,
            status: 'answered',
            plant_name: 'Balcony tomatoes',
            observed_on: '2026-09-12',
            thumb_url: '/api/observations/4/photo?variant=thumb',
            updated_at: '2026-09-14T10:00:00Z',
          },
        ]),
      ),
    )
    renderApp('/reviews', { user: grower })

    const [lemon, tomatoes] = await screen.findAllByRole('link', { name: /Seen/ })
    expect(lemon).toHaveAttribute('href', '/observations/7')
    expect(lemon).toHaveTextContent('Lemon tree')
    expect(lemon).toHaveTextContent('Waiting for your reply')
    expect(tomatoes).toHaveAttribute('href', '/observations/4')
    expect(tomatoes).toHaveTextContent('Answered')
  })

  it('explains how to ask for a review when there are none', async () => {
    server.use(http.get(apiPath('/reviews'), () => HttpResponse.json([])))
    renderApp('/reviews', { user: grower })

    expect(await screen.findByRole('heading', { name: 'No reviews yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your plants' })).toHaveAttribute('href', '/dashboard')
  })
})
