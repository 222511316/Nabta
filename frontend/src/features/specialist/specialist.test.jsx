import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import {
  grower,
  makeFeedback,
  makeMessage,
  makePestSummary,
  makeQueueItem,
  makeSpecialistCase,
  specialist,
} from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const PESTS = ['aphids', 'whiteflies', 'mealybugs', 'thrips'].map((key) => makePestSummary(key))
const takenCase = makeSpecialistCase({ assigned_to_me: true })

function caseHandlers(reviewCase) {
  return [
    http.get(apiPath('/specialist/cases/12'), () => HttpResponse.json(reviewCase)),
    http.get(apiPath('/pests'), () => HttpResponse.json(PESTS)),
  ]
}

/** Answers the assessment with the case closed, and keeps what was sent. */
function captureAssessment() {
  const captured = {}
  const handler = http.post(apiPath('/specialist/cases/12/feedback'), async ({ request }) => {
    captured.body = await request.json()
    return HttpResponse.json(
      makeSpecialistCase({ assigned_to_me: true, status: 'answered', feedback: makeFeedback() }),
      { status: 201 },
    )
  })
  return { captured, handler }
}

function assessmentForm() {
  return screen.findByRole('region', { name: 'Your assessment' })
}

describe('Specialist workspace (US08)', () => {
  it('shows a specialist their review queue, empty until growers send cases', async () => {
    server.use(http.get(apiPath('/specialist/cases'), () => HttpResponse.json([])))
    renderApp('/specialist', { user: specialist })

    expect(await screen.findByRole('heading', { name: 'Review queue' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No cases waiting' })).toBeInTheDocument()
  })
})

describe('Navigation by role (FR03)', () => {
  it('gives growers their plant tools and no review queue', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([])))
    renderApp('/dashboard', { user: grower })

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(within(nav).getByRole('link', { name: 'New observation' })).toHaveAttribute(
      'href',
      '/observations/new',
    )
    expect(within(nav).getByRole('link', { name: 'Reviews' })).toHaveAttribute('href', '/reviews')
    expect(within(nav).getByRole('link', { name: 'Pest guide' })).toHaveAttribute('href', '/pests')
    expect(within(nav).queryByRole('link', { name: 'Review queue' })).not.toBeInTheDocument()
  })

  it('gives specialists the review queue and no plant tools', async () => {
    server.use(http.get(apiPath('/specialist/cases'), () => HttpResponse.json([])))
    renderApp('/specialist', { user: specialist })

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Review queue' })).toHaveAttribute(
      'href',
      '/specialist',
    )
    expect(within(nav).getByRole('link', { name: 'Pest guide' })).toHaveAttribute('href', '/pests')
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'New observation' })).not.toBeInTheDocument()
  })
})

describe('The review queue (US14)', () => {
  it("shows the specialist's own cases apart from new ones, with Nabta's suggestion", async () => {
    server.use(
      http.get(apiPath('/specialist/cases'), () =>
        HttpResponse.json([
          makeQueueItem({ id: 12, assigned_to_me: true, status: 'waiting_for_grower' }),
          makeQueueItem({
            id: 13,
            plant_name: 'Fig tree',
            grower_name: 'Omar Saleh',
            suggestion: { outcome: 'unclear', name: null, confidence: 0.4 },
          }),
        ]),
      ),
    )
    renderApp('/specialist', { user: specialist })

    const mine = await screen.findByRole('region', { name: /Your cases/ })
    const lemon = within(mine).getByRole('link', { name: /Lemon tree/ })
    expect(lemon).toHaveAttribute('href', '/specialist/cases/12')
    expect(lemon).toHaveTextContent('Waiting for the grower')
    expect(lemon).toHaveTextContent('From Sara Ahmed, seen 20 September 2026')
    expect(lemon).toHaveTextContent('Nabta: Aphids, 92%')

    const open = screen.getByRole('region', { name: /Waiting for a specialist/ })
    const fig = within(open).getByRole('link', { name: /Fig tree/ })
    expect(fig).toHaveAttribute('href', '/specialist/cases/13')
    expect(fig).toHaveTextContent('New')
    expect(fig).toHaveTextContent('Nabta: unclear')
  })
})

describe('Taking a case (US14)', () => {
  it('shows the case, then lets the specialist take it', async () => {
    server.use(
      ...caseHandlers(makeSpecialistCase()),
      http.post(apiPath('/specialist/cases/12/claim'), () => HttpResponse.json(takenCase)),
    )
    const { events } = renderApp('/specialist/cases/12', { user: specialist })

    expect(await screen.findByRole('heading', { name: 'Lemon tree' })).toBeInTheDocument()
    expect(screen.getByText('From Sara Ahmed, seen 20 September 2026')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Insect photo from Lemon tree, seen 20 September 2026' }),
    ).toHaveAttribute('src', '/api/specialist/cases/12/photo')
    expect(screen.getByText('They keep coming back.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your assessment' })).not.toBeInTheDocument()

    await events.click(screen.getByRole('button', { name: 'Take this case' }))

    expect(await screen.findByText("You've taken this case.")).toBeInTheDocument()
    expect(await assessmentForm()).toBeInTheDocument()
    expect(screen.getByLabelText('Ask the grower a question')).toBeInTheDocument()
  })

  it('goes back to the queue when another specialist took the case first', async () => {
    server.use(
      ...caseHandlers(makeSpecialistCase()),
      http.post(apiPath('/specialist/cases/12/claim'), () => errorResponse(409, 'already_assigned')),
      http.get(apiPath('/specialist/cases'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/specialist/cases/12', { user: specialist })

    await events.click(await screen.findByRole('button', { name: 'Take this case' }))

    expect(await screen.findByText('Another specialist has taken this case.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Review queue' })).toBeInTheDocument()
  })

  it("says so when the case doesn't exist or is someone else's", async () => {
    server.use(http.get(apiPath('/specialist/cases/12'), () => errorResponse(404, 'not_found')))
    renderApp('/specialist/cases/12', { user: specialist })

    expect(await screen.findByRole('heading', { name: 'Case not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the review queue' })).toHaveAttribute(
      'href',
      '/specialist',
    )
  })
})

describe('Asking the grower (US15)', () => {
  it('sends a question and waits for the grower', async () => {
    let asked
    server.use(
      ...caseHandlers(takenCase),
      http.post(apiPath('/specialist/cases/12/questions'), async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json(
          makeSpecialistCase({
            assigned_to_me: true,
            status: 'waiting_for_grower',
            messages: [makeMessage({ body: asked.body })],
          }),
          { status: 201 },
        )
      }),
    )
    const { events } = renderApp('/specialist/cases/12', { user: specialist })

    await events.type(await screen.findByLabelText('Ask the grower a question'), 'Are they on the young leaves?')
    await events.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('Question sent.')).toBeInTheDocument()
    expect(asked).toEqual({ body: 'Are they on the young leaves?' })
    const conversation = screen.getByRole('region', { name: 'Conversation' })
    expect(within(conversation).getByText('Are they on the young leaves?')).toBeInTheDocument()
    expect(within(conversation).getByText('Khalid Alharbi (you)')).toBeInTheDocument()
    expect(within(conversation).getByText('Waiting for the grower to reply.')).toBeInTheDocument()
  })
})

describe('Sending an assessment (US16)', () => {
  it("agrees with Nabta's suggestion", async () => {
    const { captured, handler } = captureAssessment()
    server.use(...caseHandlers(takenCase), handler)
    const { events } = renderApp('/specialist/cases/12', { user: specialist })
    const form = await assessmentForm()

    await events.click(within(form).getByLabelText('Agree with Nabta: Aphids'))
    await events.type(within(form).getByLabelText(/Message to the grower/), 'These are aphids.')
    await events.click(within(form).getByRole('button', { name: 'Send assessment' }))

    expect(await screen.findByText('Assessment sent.')).toBeInTheDocument()
    expect(captured.body).toEqual({
      outcome: 'identified',
      category_key: 'aphids',
      other_pest: null,
      message: 'These are aphids.',
    })
    expect(screen.getByRole('region', { name: "Specialist's assessment" })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your assessment' })).not.toBeInTheDocument()
  })

  it("names a different pest from Nabta's categories", async () => {
    const { captured, handler } = captureAssessment()
    server.use(...caseHandlers(takenCase), handler)
    const { events } = renderApp('/specialist/cases/12', { user: specialist })
    const form = await assessmentForm()

    await events.click(within(form).getByLabelText('A different pest'))
    const pest = await within(form).findByLabelText('Pest')
    await within(pest).findByRole('option', { name: 'Whiteflies' })
    await events.selectOptions(pest, 'Whiteflies')
    await events.type(within(form).getByLabelText(/Message to the grower/), 'Look under the leaves.')
    await events.click(within(form).getByRole('button', { name: 'Send assessment' }))

    await screen.findByText('Assessment sent.')
    expect(captured.body).toMatchObject({ outcome: 'identified', category_key: 'whiteflies', other_pest: null })
  })

  it("names a pest outside Nabta's categories", async () => {
    const { captured, handler } = captureAssessment()
    server.use(...caseHandlers(takenCase), handler)
    const { events } = renderApp('/specialist/cases/12', { user: specialist })
    const form = await assessmentForm()

    await events.click(within(form).getByLabelText('A different pest'))
    await events.selectOptions(await within(form).findByLabelText('Pest'), 'Something else')
    await events.type(within(form).getByLabelText('Name of the pest'), 'Leafhoppers')
    await events.type(within(form).getByLabelText(/Message to the grower/), 'These are leafhoppers.')
    await events.click(within(form).getByRole('button', { name: 'Send assessment' }))

    await screen.findByText('Assessment sent.')
    expect(captured.body).toEqual({
      outcome: 'identified',
      category_key: null,
      other_pest: 'Leafhoppers',
      message: 'These are leafhoppers.',
    })
  })

  it("says when the photo isn't enough to tell", async () => {
    const { captured, handler } = captureAssessment()
    server.use(...caseHandlers(takenCase), handler)
    const { events } = renderApp('/specialist/cases/12', { user: specialist })
    const form = await assessmentForm()

    await events.click(within(form).getByLabelText("Can't tell from this photo"))
    await events.type(within(form).getByLabelText(/Message to the grower/), 'Please send a closer photo.')
    await events.click(within(form).getByRole('button', { name: 'Send assessment' }))

    await screen.findByText('Assessment sent.')
    expect(captured.body).toEqual({
      outcome: 'inconclusive',
      category_key: null,
      other_pest: null,
      message: 'Please send a closer photo.',
    })
  })

  it('asks for an outcome and a message before sending', async () => {
    const { captured, handler } = captureAssessment()
    server.use(...caseHandlers(takenCase), handler)
    const { events } = renderApp('/specialist/cases/12', { user: specialist })
    const form = await assessmentForm()

    await events.click(within(form).getByRole('button', { name: 'Send assessment' }))

    expect(
      await within(form).findByText("Choose what the insect is, or that you can't tell."),
    ).toBeInTheDocument()
    expect(within(form).getByLabelText(/Message to the grower/)).toHaveAccessibleDescription(
      expect.stringContaining('This field is required.'),
    )
    expect(captured.body).toBeUndefined()
  })
})
