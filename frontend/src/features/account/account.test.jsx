import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse } from '../../test/api'
import { grower } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('Account details (US04)', () => {
  it('saves a new name and shows it straight away', async () => {
    let sentBody
    server.use(
      http.patch(apiPath('/account'), async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ ...grower, full_name: sentBody.full_name })
      }),
    )
    const { events } = renderApp('/account', { user: grower })

    const fullName = await screen.findByLabelText('Full name')
    expect(fullName).toHaveValue('Sara Ahmed')
    expect(screen.getByLabelText('Email')).toHaveValue('sara@example.com')
    await events.clear(fullName)
    await events.type(fullName, 'Sara A. Ahmed')
    await events.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByText('Your details were saved.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Account menu for Sara A. Ahmed' }),
    ).toBeInTheDocument()
    expect(sentBody).toEqual({ full_name: 'Sara A. Ahmed', email: 'sara@example.com' })
  })

  it('explains when the new email already belongs to another account', async () => {
    server.use(http.patch(apiPath('/account'), () => errorResponse(409, 'email_taken')))
    const { events } = renderApp('/account', { user: grower })

    const email = await screen.findByLabelText('Email')
    await events.clear(email)
    await events.type(email, 'taken@example.com')
    await events.click(screen.getByRole('button', { name: 'Save details' }))

    await expect.poll(() => email.getAttribute('aria-invalid')).toBe('true')
    expect(email).toHaveAccessibleDescription('An account with this email already exists.')
  })
})

describe('Changing the password (US04)', () => {
  it('changes the password after checking the current one, then clears the form', async () => {
    let sentBody
    server.use(
      http.post(apiPath('/account/password'), async ({ request }) => {
        sentBody = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { events } = renderApp('/account', { user: grower })

    await events.type(await screen.findByLabelText('Current password'), 'old-password')
    await events.type(screen.getByLabelText('New password'), 'new-password-1')
    await events.type(screen.getByLabelText('Confirm new password'), 'new-password-1')
    await events.click(screen.getByRole('button', { name: 'Change password' }))

    expect(
      await screen.findByText('Your password was changed. Other devices have been signed out.'),
    ).toBeInTheDocument()
    expect(sentBody).toEqual({ current_password: 'old-password', new_password: 'new-password-1' })
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('says so when the current password is wrong', async () => {
    server.use(http.post(apiPath('/account/password'), () => errorResponse(400, 'wrong_password')))
    const { events } = renderApp('/account', { user: grower })

    const current = await screen.findByLabelText('Current password')
    await events.type(current, 'not-my-password')
    await events.type(screen.getByLabelText('New password'), 'new-password-1')
    await events.type(screen.getByLabelText('Confirm new password'), 'new-password-1')
    await events.click(screen.getByRole('button', { name: 'Change password' }))

    await expect.poll(() => current.getAttribute('aria-invalid')).toBe('true')
    expect(current).toHaveAccessibleDescription('Your current password is incorrect.')
  })
})
