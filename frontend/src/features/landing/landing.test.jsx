import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'

describe('Home page', () => {
  it('welcomes signed-out visitors and offers both ways in', async () => {
    renderApp('/')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A field notebook for the insects on your plants.',
      }),
    ).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: 'Join as a specialist' })).toHaveAttribute(
      'href',
      '/register?as=specialist',
    )
    for (const link of within(main).getAllByRole('link', { name: 'Create a grower account' })) {
      expect(link).toHaveAttribute('href', '/register?as=grower')
    }
    expect(screen.getByRole('banner')).toContainElement(
      screen.getAllByRole('link', { name: 'Sign in' })[0],
    )
  })

  it('shows the example record that the illustration describes', async () => {
    renderApp('/')

    expect(await screen.findByText('Lemon tree, back garden')).toBeInTheDocument()
  })
})
