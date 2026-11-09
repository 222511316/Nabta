import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower, makePlant, pendingSpecialist } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('Sign in (US02)', () => {
  it('signs in and continues to the page the visitor asked for', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/auth/login'), async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json(grower)
      }),
    )
    const { events } = renderApp('/plants/new')

    await events.type(await screen.findByLabelText('Email'), 'sara@example.com')
    await events.type(screen.getByLabelText('Password'), 'correct-horse')
    await events.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Add a plant' })).toBeInTheDocument()
    expect(sentBody).toEqual({ email: 'sara@example.com', password: 'correct-horse', role: 'grower' })
  })

  it('explains a wrong email or password', async () => {
    server.use(http.post(apiPath('/auth/login'), () => errorResponse(401, 'invalid_credentials')))
    const { events } = renderApp('/sign-in')

    await events.type(await screen.findByLabelText('Email'), 'sara@example.com')
    await events.type(screen.getByLabelText('Password'), 'wrong-password')
    await events.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('asks for both fields before contacting the server', async () => {
    let loginCalled = false
    server.use(
      http.post(apiPath('/auth/login'), () => {
        loginCalled = true
        return HttpResponse.json(grower)
      }),
    )
    const { events } = renderApp('/sign-in')

    await events.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(await screen.findAllByText('This field is required.')).toHaveLength(2)
    expect(loginCalled).toBe(false)
  })
})

describe('Sign out (US02)', () => {
  it('ends the session and drops the private data cached in the browser', async () => {
    let logoutCalled = false
    server.use(
      http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])),
      http.post(apiPath('/auth/logout'), () => {
        logoutCalled = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { events, queryClient } = renderApp('/dashboard', { user: grower })
    await screen.findByText('Lemon tree')

    await events.click(screen.getByRole('button', { name: 'Account menu for Sara Ahmed' }))
    await events.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(logoutCalled).toBe(true)
    expect(queryClient.getQueryData(['plants'])).toBeUndefined()
  })
})

describe('Create an account (US01)', () => {
  it('creates a grower account and opens the dashboard', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/auth/register'), async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json(grower, { status: 201 })
      }),
      http.get(apiPath('/plants'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/register')

    await events.type(await screen.findByLabelText('Full name'), 'Sara Ahmed')
    await events.type(screen.getByLabelText('Email'), 'sara@example.com')
    await events.type(screen.getByLabelText('Password'), 'correct-horse')
    await events.type(screen.getByLabelText('Confirm password'), 'correct-horse')
    await events.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Your plants' })).toBeInTheDocument()
    expect(await screen.findByText('Welcome to Nabta, Sara Ahmed.')).toBeInTheDocument()
    expect(sentBody).toEqual({
      full_name: 'Sara Ahmed',
      email: 'sara@example.com',
      password: 'correct-horse',
      role: 'grower',
    })
  })

  it('points out invalid details before sending them', async () => {
    const { events } = renderApp('/register')

    await events.type(await screen.findByLabelText('Email'), 'not-an-email')
    await events.type(screen.getByLabelText('Password'), 'short')
    await events.type(screen.getByLabelText('Confirm password'), 'different')
    await events.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByLabelText('Full name')).toHaveAccessibleDescription(
      'This field is required.',
    )
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address, like name@example.com.',
    )
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      expect.stringContaining('Use at least 8 characters.'),
    )
    expect(screen.getByLabelText('Confirm password')).toHaveAccessibleDescription(
      "The passwords don't match.",
    )
  })

  it('shows on the email field when the email already has an account', async () => {
    server.use(http.post(apiPath('/auth/register'), () => errorResponse(409, 'email_taken')))
    const { events } = renderApp('/register')

    await events.type(await screen.findByLabelText('Full name'), 'Sara Ahmed')
    await events.type(screen.getByLabelText('Email'), 'sara@example.com')
    await events.type(screen.getByLabelText('Password'), 'correct-horse')
    await events.type(screen.getByLabelText('Confirm password'), 'correct-horse')
    await events.click(screen.getByRole('button', { name: 'Create account' }))

    const email = screen.getByLabelText('Email')
    await expect.poll(() => email.getAttribute('aria-invalid')).toBe('true')
    expect(email).toHaveAccessibleDescription('An account with this email already exists.')
  })
})

describe('Password reset (US03)', () => {
  it('requests a reset link without revealing whether the account exists', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/auth/password-reset/request'), async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ ok: true }, { status: 202 })
      }),
    )
    const { events } = renderApp('/forgot-password')

    await events.type(await screen.findByLabelText('Email'), 'sara@example.com')
    await events.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(/If there's an account for sara@example.com/)).toBeInTheDocument()
    expect(sentBody).toEqual({ email: 'sara@example.com' })
  })

  it('sets a new password from the emailed link, then asks the user to sign in', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/auth/password-reset/confirm'), async ({ request }) => {
        sentBody = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { events } = renderApp('/reset-password?token=abc123')

    await events.type(await screen.findByLabelText('New password'), 'new-password-1')
    await events.type(screen.getByLabelText('Confirm new password'), 'new-password-1')
    await events.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      screen.getByText('Your password has been changed. Sign in with your new password.'),
    ).toBeInTheDocument()
    expect(sentBody).toEqual({ token: 'abc123', new_password: 'new-password-1' })
  })

  it('explains an expired or already-used link and offers a new one', async () => {
    server.use(
      http.post(apiPath('/auth/password-reset/confirm'), () =>
        errorResponse(400, 'invalid_reset_token'),
      ),
    )
    const { events } = renderApp('/reset-password?token=used-token')

    await events.type(await screen.findByLabelText('New password'), 'new-password-1')
    await events.type(screen.getByLabelText('Confirm new password'), 'new-password-1')
    await events.click(screen.getByRole('button', { name: 'Save new password' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This reset link is invalid or has expired. Request a new one.')
    expect(within(alert).getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('explains a link that is missing its token', async () => {
    renderApp('/reset-password')

    expect(
      await screen.findByText('This reset link is incomplete. Request a new link to continue.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })
})

describe('Choosing a role', () => {
  // Supervisor review OBS-14: website sign-up makes a pending specialist, who waits for the team's approval.
  it('signs up a plant specialist, who waits for the Nabta team to approve the account', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/auth/register'), async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json(pendingSpecialist, { status: 201 })
      }),
    )
    const { events } = renderApp('/register')

    await events.click(await screen.findByRole('radio', { name: /Plant specialist/ }))
    await events.type(screen.getByLabelText('Full name'), 'Khalid Alharbi')
    await events.type(screen.getByLabelText('Email'), 'khalid@example.com')
    await events.type(screen.getByLabelText('Password'), 'correct-horse')
    await events.type(screen.getByLabelText('Confirm password'), 'correct-horse')
    await events.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Awaiting approval' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Review queue' })).not.toBeInTheDocument()
    expect(sentBody.role).toBe('specialist')
  })

  it('starts with the role chosen on the home page', async () => {
    renderApp('/register?as=specialist')

    expect(await screen.findByRole('radio', { name: /Plant specialist/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Grower/ })).not.toBeChecked()
  })

  it('keeps the chosen role when moving between sign-up and sign-in', async () => {
    const { events } = renderApp('/register?as=specialist')

    await events.click(await screen.findByRole('link', { name: 'Sign in' }))

    expect(await screen.findByRole('radio', { name: /Plant specialist/ })).toBeChecked()
  })

  it('explains when the account belongs to the other role and offers to switch', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/auth/login'), async ({ request }) => {
        sentBody = await request.json()
        return errorResponse(403, 'role_mismatch')
      }),
    )
    const { events } = renderApp('/sign-in?as=specialist')

    await events.type(await screen.findByLabelText('Email'), 'sara@example.com')
    await events.type(screen.getByLabelText('Password'), 'correct-horse')
    await events.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This email belongs to a grower account.')
    expect(sentBody.role).toBe('specialist')
    await events.click(within(alert).getByRole('button', { name: 'Sign in as a grower' }))
    expect(screen.getByRole('radio', { name: /Grower/ })).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
