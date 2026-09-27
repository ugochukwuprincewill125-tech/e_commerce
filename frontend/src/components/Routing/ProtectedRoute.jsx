import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { ACCOUNT_HOME, currentTarget, safeNext, withNext } from '../../utils/navigation'
import { PageLoader } from '../Loader/Skeleton'

/** Requires a session. Guests are sent to sign in and returned afterwards. */
export default function ProtectedRoute({ children }) {
  const { user, initialising } = useAuth()
  const location = useLocation()
  if (initialising) return <PageLoader />
  if (!user) return <Navigate to={withNext(currentTarget(location))} replace />
  return children
}

/** Rejects signed-in users, honouring a validated `?next=` target. */
export function GuestOnlyRoute({ children }) {
  const { user, initialising } = useAuth()
  const location = useLocation()
  if (initialising) return <PageLoader />
  if (user) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={safeNext(next)} replace />
  }
  return children
}

/**
 * The storefront landing page is for signed-out visitors only. A signed-in user
 * who requests `/` — by typing it, bookmarking it, or following a stale link —
 * is sent to their account dashboard instead, so the marketing page never
 * renders behind an active session.
 */
export function GuestLandingRoute({ children }) {
  const { user, initialising } = useAuth()
  if (initialising) return <PageLoader />
  if (user) return <Navigate to={ACCOUNT_HOME} replace />
  return children
}
