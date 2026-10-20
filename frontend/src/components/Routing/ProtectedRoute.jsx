import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { ACCOUNT_HOME, CART_RESUME_MARKER, CART_RESUME_PARAM, currentTarget, safeNext, withNext } from '../../utils/navigation'
import { PageLoader } from '../Loader/Skeleton'

/** Requires a session. Guests are sent to sign in and returned afterwards. */
export default function ProtectedRoute({ children }) {
  const { user, initialising } = useAuth()
  const location = useLocation()
  if (initialising) return <PageLoader />
  if (!user) return <Navigate to={withNext(currentTarget(location))} replace />
  // Defence in depth: a stale token or an email change can surface an
  // unverified profile in the client. Never render customer-only pages for it.
  // Staff keep access to the separately guarded /admin area.
  if (!user.email_verified) {
    return (
      <Navigate
        to={`/verify-email?email=${encodeURIComponent(user.email || '')}`}
        replace
      />
    )
  }
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
 *
 * Exception: returning from the add-to-cart sign-in gate carries
 * `?cart_resume=1`, so the signed-in visitor lands back on the storefront and
 * the pending item is added (see Home).
 */
export function GuestLandingRoute({ children }) {
  const { user, initialising } = useAuth()
  const location = useLocation()
  if (initialising) return <PageLoader />
  if (new URLSearchParams(location.search).get(CART_RESUME_PARAM) === CART_RESUME_MARKER) return children
  if (user) return <Navigate to={ACCOUNT_HOME} replace />
  return children
}
