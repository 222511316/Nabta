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
  makeSpecialistCase,
  specialist,
} from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const aphids = makePest()

describe('The pest guide (US11)', () => {
  it('lists every pest Nabta can suggest, each opening its page', async () => {
    server.use(
      http.get(apiPath('/pests'), () =>
        HttpResponse.json([makePestSummary('aphids'), makePestSummary('whiteflies')]),
      ),
    )
    renderApp('/pests', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Pest guide' })).toBeInTheDocument()
    const links = await within(screen.getByRole('main')).findAllByRole('link', { name: /Aphids|Whiteflies/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/pests/aphids', '/pests/whiteflies'])
    expect(links[0]).toHaveTextContent('About Aphids.')
    expect(screen.getByText(/awaiting review by a plant specialist/)).toBeInTheDocument()
  })
})

describe('A pest page (US11, NFR14)', () => {
  it('describes the pest, shows its reference photos and cites its source', async () => {
    server.use(http.get(apiPath('/pests/aphids'), () => HttpResponse.json(aphids)))
    renderApp('/pests/aphids', { user: grower })

    expect(await screen.findByRole('heading', { level: 1, name: 'Aphids' })).toBeInTheDocument()
    expect(screen.getByText(/Small, soft-bodied insects/)).toBeInTheDocument()
    const lookFor = screen.getByRole('region', { name: 'What to look for' })
    expect(within(lookFor).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Where on the plant')).toBeInTheDocument()
    expect(screen.getByText('Often confused with')).toBeInTheDocument()

    expect(screen.getByRole('img', { name: 'Black aphids on a stem' })).toHaveAttribute(
      'src',
      '/api/pests/aphids/images/aphids-2.jpg',
    )
    expect(screen.getAllByText('IP102 dataset (Wu et al., CVPR 2019), class 28')).toHaveLength(3)

    const source = screen.getByRole('link', { name: 'Aphids' })
    expect(source).toHaveAttribute('href', 'https://ipm.ucanr.edu/home-and-landscape/aphids/')
    expect(source).toHaveAttribute('target', '_blank')
    expect(screen.getByText('UC Statewide IPM Program (UC IPM)')).toBeInTheDocument()
    expect(screen.getByText('Awaiting specialist review')).toBeInTheDocument()
  })

  it('names who reviewed the content, once a specialist has', async () => {
    server.use(
      http.get(apiPath('/pests/aphids'), () =>
        HttpResponse.json(
          makePest({ review: { status: 'reviewed', reviewed_by: 'Khalid Alharbi', reviewed_on: '2026-10-20' } }),
        ),
      ),
    )
    renderApp('/pests/aphids', { user: grower })

    expect(await screen.findByText('Reviewed by Khalid Alharbi, 20 October 2026')).toBeInTheDocument()
  })

  it("puts the grower's photo beside the reference photos", async () => {
    const observation = makeObservation({ id: 7, analysis: makeAnalysis() })
    server.use(
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(aphids)),
      http.get(apiPath('/observations/7'), () => HttpResponse.json(observation)),
    )
    const { events } = renderApp('/pests/aphids?observation=7', { user: grower })

    expect(await screen.findByRole('heading', { level: 1, name: 'Compare with Aphids' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Insect photo from Lemon tree, seen 20 September 2026' })).toHaveAttribute(
      'src',
      '/api/observations/7/photo',
    )
    expect(screen.getByRole('img', { name: 'Close-up of one aphid' })).toBeInTheDocument()

    const second = screen.getByRole('button', { name: 'Show reference photo 2: Black aphids on a stem' })
    await events.click(second)
    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('img', { name: 'Close-up of one aphid' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Black aphids on a stem' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Whiteflies' })).toHaveAttribute('href', '/pests/whiteflies?observation=7')
    expect(screen.getByRole('link', { name: 'Mealybugs' })).toHaveAttribute('href', '/pests/mealybugs?observation=7')
    expect(screen.getByRole('link', { name: /Back to your observation/ })).toHaveAttribute('href', '/observations/7')
  })

  it("lets a specialist compare a case's photo too", async () => {
    server.use(
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(aphids)),
      http.get(apiPath('/specialist/cases/12'), () => HttpResponse.json(makeSpecialistCase({ assigned_to_me: true }))),
    )
    renderApp('/pests/aphids?case=12', { user: specialist })

    expect(await screen.findByText("Grower's photo")).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Insect photo from Lemon tree, seen 20 September 2026' })).toHaveAttribute(
      'src',
      '/api/specialist/cases/12/photo',
    )
    expect(screen.getByRole('link', { name: /Back to the case/ })).toHaveAttribute('href', '/specialist/cases/12')
  })

  it("says so when Nabta has no page for a pest", async () => {
    server.use(http.get(apiPath('/pests/ladybirds'), () => errorResponse(404, 'not_found')))
    renderApp('/pests/ladybirds', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Pest not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the pest guide' })).toHaveAttribute('href', '/pests')
  })
})
