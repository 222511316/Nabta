import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AppProviders } from '../App'
import { createQueryClient } from '../queryClient'
import { AppRoutes } from '../routes'
import { meHandler } from './api'
import { server } from './server'

/**
 * Renders the real app (providers, routes, guards) at `route`, with the
 * session answering as `user` (null = signed out), or with a custom
 * `sessionHandler` for GET /api/auth/me. API calls go through the real
 * client and are answered by MSW handlers the test registers.
 */
export function renderApp(route, { user = null, sessionHandler = meHandler(user) } = {}) {
  server.use(sessionHandler)
  const queryClient = createQueryClient({ queries: { retry: false } })
  const events = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders queryClient={queryClient}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  )
  return { ...view, queryClient, events }
}
