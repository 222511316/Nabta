import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower, makeAnalysis, makeObservation, makePest, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const newObservation = makeObservation({ id: 7, plant_id: 3 })

function observationHandlers({ observation = newObservation, analyse } = {}) {
  return [
    http.get(apiPath('/observations/7'), () => HttpResponse.json(observation)),
    http.post(apiPath('/observations/7/analysis'), analyse ?? (() => HttpResponse.json(makeAnalysis(), { status: 201 }))),
    http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
  ]
}

async function suggestionPanel() {
  return screen.findByRole('region', { name: "Nabta's suggestion" })
}

describe('Identifying the insect (US09)', () => {
  it('analyses a new observation, then shows the suggestion with its confidence', async () => {
    let requests = 0
    server.use(
      ...observationHandlers({
        analyse: async () => {
          requests += 1
          await delay(30)
          return HttpResponse.json(makeAnalysis(), { status: 201 })
        },
      }),
    )
    renderApp('/observations/7', { user: grower })
    const panel = await suggestionPanel()

    expect(await within(panel).findByRole('status')).toHaveTextContent('Looking for the insect…')
    expect(await within(panel).findByText('Aphids')).toBeInTheDocument()
    expect(within(panel).getByText('Very likely, 92%')).toBeInTheDocument()
    expect(await within(panel).findByText(/Small, soft-bodied insects/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Compare with reference photos' })).toHaveAttribute(
      'href',
      '/pests/aphids?observation=7',
    )
    expect(within(panel).getByRole('button', { name: 'Ask a specialist' })).toBeInTheDocument()
    expect(within(panel).getByText('Also possible: Whiteflies (5%) and Mealybugs (2%).')).toBeInTheDocument()
    expect(within(panel).getByText(/Model nabta-pest-1\.0/)).toBeInTheDocument()
    expect(requests).toBe(1)
  })

  it('shows a saved result without analysing the photo again', async () => {
    let requests = 0
    server.use(
      ...observationHandlers({
        observation: { ...newObservation, analysis: makeAnalysis() },
        analyse: () => {
          requests += 1
          return HttpResponse.json(makeAnalysis())
        },
      }),
    )
    renderApp('/observations/7', { user: grower })
    const panel = await suggestionPanel()

    expect(within(panel).getByText('Aphids')).toBeInTheDocument()
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument()
    expect(requests).toBe(0)
  })

  it('offers to try again when identification fails, and a retry can succeed', async () => {
    let requests = 0
    server.use(
      ...observationHandlers({
        analyse: () => {
          requests += 1
          return requests === 1
            ? errorResponse(503, 'analysis_failed')
            : HttpResponse.json(makeAnalysis(), { status: 201 })
        },
      }),
    )
    const { events } = renderApp('/observations/7', { user: grower })
    const panel = await suggestionPanel()

    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent("Identification didn't finish")
    expect(alert).toHaveTextContent("The photo couldn't be analysed. Try again.")
    await events.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await within(panel).findByText('Very likely, 92%')).toBeInTheDocument()
    expect(requests).toBe(2)
  })

  it('explains when identification is not available, and keeps the observation', async () => {
    server.use(...observationHandlers({ analyse: () => errorResponse(503, 'analysis_unavailable') }))
    renderApp('/observations/7', { user: grower })
    const panel = await suggestionPanel()

    expect(await within(panel).findByText("Identification isn't available right now")).toBeInTheDocument()
    expect(within(panel).getByText('Your observation is saved. Try again later, or ask a specialist.')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Ask a specialist' })).toBeInTheDocument()
  })
})

describe('Understanding uncertainty (US10)', () => {
  it("says when Nabta can't tell, names the closest matches and offers next steps", async () => {
    const unclear = makeAnalysis({
      outcome: 'unclear',
      predictions: [
        ['aphids', 0.41],
        ['whiteflies', 0.22],
        ['thrips', 0.12],
      ],
    })
    server.use(...observationHandlers({ analyse: () => HttpResponse.json(unclear, { status: 201 }) }))
    renderApp('/observations/7', { user: grower })
    const panel = await suggestionPanel()

    expect(await within(panel).findByText("Nabta can't tell what this is")).toBeInTheDocument()
    expect(
      within(panel).getByText(
        'It looks closest to Aphids (41%) or Whiteflies (22%), but neither is likely enough to suggest.',
      ),
    ).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Add a new photo' })).toHaveAttribute(
      'href',
      '/observations/new?plantId=3',
    )
    expect(within(panel).getByRole('link', { name: 'Compare with Aphids' })).toHaveAttribute(
      'href',
      '/pests/aphids?observation=7',
    )
    expect(within(panel).getByRole('button', { name: 'Ask a specialist' })).toBeInTheDocument()
  })
})

describe('Insects Nabta was not trained on (US10, R03)', () => {
  it('says the insect is unlike the ones it knows, without misleading percentages', async () => {
    const unfamiliar = makeAnalysis({
      outcome: 'unclear',
      unclear_reason: 'unfamiliar',
      predictions: [
        ['aphids', 0.93],
        ['whiteflies', 0.04],
      ],
    })
    server.use(...observationHandlers({ analyse: () => HttpResponse.json(unfamiliar, { status: 201 }) }))
    renderApp('/observations/7', { user: grower })
    const panel = await suggestionPanel()

    expect(await within(panel).findByText("Nabta can't tell what this is")).toBeInTheDocument()
    expect(
      within(panel).getByText(
        "It doesn't look enough like the insects Nabta knows. The closest are Aphids and Whiteflies.",
      ),
    ).toBeInTheDocument()
    expect(within(panel).queryByText(/93%/)).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Ask a specialist' })).toBeInTheDocument()
  })
})

describe('Results in the plant history (FR10)', () => {
  it("shows each observation's result and review status on the plant's page", async () => {
    const plant = makePlant({ id: 3, observation_count: 3 })
    server.use(
      http.get(apiPath('/plants/3'), () => HttpResponse.json(plant)),
      http.get(apiPath('/plants/3/observations'), () =>
        HttpResponse.json([
          makeObservation({ id: 7, observed_on: '2026-09-20', analysis: makeAnalysis() }),
          makeObservation({
            id: 8,
            observed_on: '2026-09-18',
            analysis: makeAnalysis({ outcome: 'unclear', predictions: [['thrips', 0.3]] }),
            review_status: 'waiting_for_grower',
          }),
          makeObservation({ id: 9, observed_on: '2026-09-15' }),
        ]),
      ),
    )
    renderApp('/plants/3', { user: grower })

    const [identified, unclear, notYet] = await screen.findAllByRole('article')
    expect(identified).toHaveTextContent('Aphids92%')
    expect(unclear).toHaveTextContent('Unclear')
    expect(within(unclear).getByText('Waiting for your reply')).toBeInTheDocument()
    expect(notYet).not.toHaveTextContent(/Unclear|%/)
  })
})
