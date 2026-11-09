import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower, makePlant, pendingSpecialist, specialist } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

// Supervisor review OBS-14 (FR03, FR12, NFR06): a specialist who signs up on the website waits for
// the Nabta team's approval and sees no review cases until then. Any request for cases would fail
// these tests, because every API call must be answered by a handler the test declared.

const SIGN_UP_MESSAGE =
  'Your specialist account was created. The Nabta team must approve it before you can see review cases.'
const SIGN_UP_MESSAGE_AR =
  'تم إنشاء حساب الأخصائي الخاص بك. يجب أن يوافق فريق نبتة عليه قبل أن تتمكن من رؤية حالات المراجعة.'

async function signUpAsSpecialist(events) {
  await events.click(await screen.findByRole('radio', { name: /Plant specialist|أخصائي نباتات/ }))
  await events.type(screen.getByLabelText(/Full name|الاسم الكامل/), 'Huda Alqahtani')
  await events.type(screen.getByLabelText(/^(Email|البريد الإلكتروني)$/), 'huda@example.com')
  await events.type(screen.getByLabelText(/^(Password|كلمة المرور)$/), 'correct-horse')
  await events.type(screen.getByLabelText(/Confirm password|تأكيد كلمة المرور/), 'correct-horse')
  await events.click(screen.getByRole('button', { name: /Create account|إنشاء الحساب/ }))
}

describe('Specialist sign-up', () => {
  it('says the account needs approval before the specialist signs up', async () => {
    const { events } = renderApp('/register')
    expect(screen.queryByText(/approved by the Nabta team/)).not.toBeInTheDocument()

    await events.click(await screen.findByRole('radio', { name: /Plant specialist/ }))

    expect(
      screen.getByText("Specialist accounts are approved by the Nabta team. You'll see review cases once yours is approved."),
    ).toBeInTheDocument()
  })

  it('tells a new specialist the team must approve the account, and shows no queue', async () => {
    server.use(http.post(apiPath('/auth/register'), () => HttpResponse.json(pendingSpecialist, { status: 201 })))
    const { events } = renderApp('/register')

    await signUpAsSpecialist(events)

    expect(await screen.findByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeInTheDocument()
    // Once in the toast, once on the panel.
    expect(await screen.findAllByText(SIGN_UP_MESSAGE)).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Review queue' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Welcome to Nabta/)).not.toBeInTheDocument()
  })

  it('says the same in Arabic, right to left', async () => {
    server.use(http.post(apiPath('/auth/register'), () => HttpResponse.json(pendingSpecialist, { status: 201 })))
    const { events } = renderApp('/register')
    await events.click(await screen.findByRole('button', { name: 'العربية' }))

    await signUpAsSpecialist(events)

    expect(await screen.findByRole('heading', { level: 1, name: 'بانتظار الموافقة' })).toBeInTheDocument()
    expect(await screen.findAllByText(SIGN_UP_MESSAGE_AR)).toHaveLength(2)
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
  })

  it('welcomes a grower as before', async () => {
    server.use(
      http.post(apiPath('/auth/register'), () => HttpResponse.json(grower, { status: 201 })),
      http.get(apiPath('/plants'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/register')

    await events.type(await screen.findByLabelText('Full name'), 'Sara Ahmed')
    await events.type(screen.getByLabelText('Email'), 'sara@example.com')
    await events.type(screen.getByLabelText('Password'), 'correct-horse')
    await events.type(screen.getByLabelText('Confirm password'), 'correct-horse')
    await events.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Welcome to Nabta, Sara Ahmed.')).toBeInTheDocument()
    expect(screen.queryByText(SIGN_UP_MESSAGE)).not.toBeInTheDocument()
  })
})

describe('Awaiting approval', () => {
  it('replaces the review queue for a pending specialist, without asking for cases', async () => {
    renderApp('/specialist', { user: pendingSpecialist })

    expect(await screen.findByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(SIGN_UP_MESSAGE)
    expect(screen.getByRole('link', { name: 'Go to your account' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('heading', { name: 'Review queue' })).not.toBeInTheDocument()
  })

  it('replaces a case page too', async () => {
    renderApp('/specialist/cases/12', { user: pendingSpecialist })

    expect(await screen.findByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeInTheDocument()
  })

  it('appears in Arabic', async () => {
    const { events } = renderApp('/specialist', { user: pendingSpecialist })
    await screen.findByRole('heading', { level: 1, name: 'Awaiting approval' })
    await events.click(screen.getByRole('button', { name: 'العربية' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'بانتظار الموافقة' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(SIGN_UP_MESSAGE_AR)
  })

  it('shows the queue to an approved specialist', async () => {
    server.use(http.get(apiPath('/specialist/cases'), () => HttpResponse.json([])))
    renderApp('/specialist', { user: specialist })

    expect(await screen.findByRole('heading', { level: 1, name: 'Review queue' })).toBeInTheDocument()
    expect(screen.queryByText('Awaiting approval')).not.toBeInTheDocument()
  })

  it('takes over when approval is withdrawn while the queue is open', async () => {
    let me = specialist
    server.use(
      http.get(apiPath('/auth/me'), () => HttpResponse.json(me)),
      http.get(apiPath('/specialist/cases'), () => {
        me = { ...specialist, specialist_status: 'pending', approved_at: null }
        return errorResponse(403, 'specialist_pending')
      }),
    )
    renderApp('/specialist', { sessionHandler: http.get(apiPath('/auth/me'), () => HttpResponse.json(me)) })

    expect(await screen.findByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeInTheDocument()
  })

  it('shows the approval state on the account page', async () => {
    renderApp('/account', { user: pendingSpecialist })

    expect(await screen.findByText('Awaiting approval by the Nabta team')).toBeInTheDocument()
  })

  it("leaves growers' pages unchanged", async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])))
    renderApp('/account', { user: grower })

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByText(/Review access/)).not.toBeInTheDocument()
  })
})
