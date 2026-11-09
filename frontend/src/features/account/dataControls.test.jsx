import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower, makeGrowerCase, makeObservation, makePlant, specialist } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('Research consent (US22)', () => {
  it('is off until the grower switches it on, and records when it changed', async () => {
    let sent
    server.use(
      http.patch(apiPath('/account/consent'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...grower, research_consent: true, research_consent_at: '2026-10-27T09:30:00Z' })
      }),
    )
    const { events } = renderApp('/account', { user: grower })

    const toggle = await screen.findByRole('switch', { name: 'Let the Nabta team use my photos to test the model' })
    expect(toggle).not.toBeChecked()
    expect(screen.getByText("You haven't changed this setting.")).toBeInTheDocument()

    await events.click(toggle)

    expect(await screen.findByText('The Nabta team may now use your photos to test the model.')).toBeInTheDocument()
    expect(toggle).toBeChecked()
    expect(screen.getByText(/Last changed 27 October 2026/)).toBeInTheDocument()
    expect(sent).toEqual({ research_consent: true })
  })

  it("isn't shown to specialists, who have no photos of their own", async () => {
    renderApp('/account', { user: specialist })

    await screen.findByRole('heading', { name: 'Account' })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
  })
})

describe('Deleting the account (US22)', () => {
  it('says what goes, needs the password, then signs the grower out', async () => {
    let sentPassword
    server.use(
      http.delete(apiPath('/account'), async ({ request }) => {
        sentPassword = (await request.json()).password
        return sentPassword === 'correct-horse'
          ? new HttpResponse(null, { status: 204 })
          : errorResponse(400, 'wrong_password')
      }),
    )
    const { events } = renderApp('/account', { user: grower })

    const section = await screen.findByRole('region', { name: 'Delete your account' })
    expect(section).toHaveTextContent('Every photo, with Nabta\'s results')
    await events.click(within(section).getByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })

    await events.type(within(dialog).getByLabelText('Password'), 'wrong-one')
    await events.click(within(dialog).getByRole('button', { name: 'Delete everything' }))
    expect(await within(dialog).findByText('That password is incorrect.')).toBeInTheDocument()

    await events.clear(within(dialog).getByLabelText('Password'))
    await events.type(within(dialog).getByLabelText('Password'), 'correct-horse')
    await events.click(within(dialog).getByRole('button', { name: 'Delete everything' }))

    expect(await screen.findByText('Your account and all its data were deleted.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'A field notebook for the insects on your plants.' })).toBeInTheDocument()
    expect(sentPassword).toBe('correct-horse')
  })
})

describe('Deleting one observation (US22)', () => {
  it('asks first, says what goes, then returns to the plant', async () => {
    let deleted = false
    server.use(
      http.get(apiPath('/observations/7'), () => HttpResponse.json(makeObservation({ review_status: 'answered' }))),
      http.get(apiPath('/observations/7/review'), () => HttpResponse.json(makeGrowerCase({ status: 'answered' }))),
      http.delete(apiPath('/observations/7'), () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant())),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/observations/7', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Delete observation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete the observation from 20 September 2026?' })
    expect(dialog).toHaveTextContent('the specialist review with its messages')
    expect(dialog).toHaveTextContent('Tasks you made from it stay on the plant.')
    await events.click(within(dialog).getByRole('button', { name: 'Delete observation' }))

    expect(await screen.findByRole('heading', { name: 'Lemon tree' })).toBeInTheDocument()
    expect(await screen.findByText('The observation was deleted.')).toBeInTheDocument()
    expect(deleted).toBe(true)
  })
})
