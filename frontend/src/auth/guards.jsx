import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageError, FullPageSpinner } from '../components/layout/FullPageStatus'
import { ForbiddenPage } from '../features/errors/ForbiddenPage'
import { LandingPage } from '../features/landing/LandingPage'
import { useAuth } from './useAuth'
import { homePathFor } from './homePath'

/** Waits for the session check; shows a retry screen if the server can't be reached. */
function SessionGate({ children }) {
  const { isLoading, loadError, reload } = useAuth()
  if (isLoading) return <FullPageSpinner />
  if (loadError) return <FullPageError onRetry={reload} />
  return children
}

/** Signed-in users only. Others go to sign in, and come back here afterwards. */
export function RequireAuth() {
  return (
    <SessionGate>
      <RequireAuthInner />
    </SessionGate>
  )
}

function RequireAuthInner() {
  const { user, endReason } = useAuth()
  const location = useLocation()
  if (user) return <Outlet />
  // After a deliberate sign-out, start fresh rather than returning to the old page.
  const state =
    endReason === 'signed_out'
      ? undefined
      : { from: location, sessionExpired: endReason === 'expired' }
  return <Navigate to="/sign-in" replace state={state} />
}

/** Pages for one role; the server enforces the same rule (spec §3.3). */
export function RoleGate({ role }) {
  const { user } = useAuth()
  if (user.role !== role) return <ForbiddenPage requiredRole={role} />
  return <Outlet />
}

/** Sign-in and registration: a signed-in user is sent on to their workspace. */
export function PublicOnlyRoute() {
  return (
    <SessionGate>
      <PublicOnlyInner />
    </SessionGate>
  )
}

function PublicOnlyInner() {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Outlet />
  const from = location.state?.from
  const target = from ? { pathname: from.pathname, search: from.search, hash: from.hash } : homePathFor(user)
  return <Navigate to={target} replace />
}

export function RootRedirect() {
  return (
    <SessionGate>
      <RootRedirectInner />
    </SessionGate>
  )
}

// Signed-in users go to their workspace; everyone else sees the home page.
function RootRedirectInner() {
  const { user } = useAuth()
  return user ? <Navigate to={homePathFor(user)} replace /> : <LandingPage />
}
