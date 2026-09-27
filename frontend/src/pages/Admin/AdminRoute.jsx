import { Link, Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { PageLoader } from '../../components/Loader/Skeleton'

export default function AdminRoute() {
  const { user, initialising } = useAuth()

  if (initialising) return <PageLoader />
  if (!user) return <Navigate to="/login?next=/admin" replace />
  if (!user.is_staff) {
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
  return <Outlet />
}
