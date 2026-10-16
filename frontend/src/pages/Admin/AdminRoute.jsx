import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { PageLoader } from '../../components/Loader/Skeleton'

/**
 * Guard that renders its children (the admin layout) only for admins. The
 * nested admin routes render through the <Outlet /> inside AdminLayout —
 * NOT through an Outlet here, which would skip the layout entirely.
 */
export default function AdminRoute({ children }) {
  const { user, initialising } = useAuth()

  if (initialising) return <PageLoader />
  if (!user) return <Navigate to="/login?next=/admin" replace />
  // Only superusers may use the admin area — every admin API endpoint enforces
  // is_superuser server-side, so the client gate must agree or a half-privileged
  // account would reach a UI that 403s on every request.
  if (!user.is_superuser) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-bold text-ink-950">Staff access only</p>
        <p className="max-w-sm text-sm text-neutral-500">
          This area is for store administrators. If you believe you should have access, contact the store owner.
        </p>
        <Link to="/" className="btn-outline mt-2">Back to store</Link>
      </div>
    )
  }
  return children
}
