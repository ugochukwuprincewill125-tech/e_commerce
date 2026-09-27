import { AnimatePresence, motion } from 'framer-motion'
import { Heart, LayoutDashboard, LogOut, MapPin, Package, User } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/format'

const NAV = [
  { to: '/account', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/account/orders', label: 'My Orders', icon: Package },
  { to: '/account/wishlist', label: 'My Wishlist', icon: Heart },
  { to: '/account/addresses', label: 'Saved Addresses', icon: MapPin },
  { to: '/account/profile', label: 'Profile Settings', icon: User },
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <>
      <Seo title="My account" noindex />

      <div className="border-b border-line bg-white">
        <div className="container flex items-center gap-4 py-5">
          <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full bg-ink-900 text-sm font-bold text-white">
            {user.profile_image ? (
              <img src={user.profile_image} alt="" className="h-full w-full object-cover" />
            ) : (
              `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`
            )}
          </span>
          <div className="min-w-0">
            <Breadcrumbs items={[{ label: 'My Account' }]} className="hidden sm:block" />
            <h1 className="truncate text-[19px] font-semibold tracking-tight text-ink-900">
              Hello, {user.first_name}
            </h1>
          </div>
        </div>
      </div>

      <div className="bg-metal-50 py-6">
        <div className="container grid gap-5 lg:grid-cols-[230px_1fr]">
          {/* Jumia-style account sidebar */}
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <nav
              className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0"
              aria-label="Account"
            >
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-none items-center gap-2.5 whitespace-nowrap rounded border-l-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'border-brand-600 bg-white text-ink-900'
                        : 'border-transparent text-metal-600 hover:bg-white hover:text-ink-900',
                    )
                  }
                >
                  <Icon className="h-4 w-4 flex-none" strokeWidth={1.75} />
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={async () => {
                  navigate('/')
                  await logout()
                }}
                className="flex flex-none items-center gap-2.5 whitespace-nowrap border-l-2 border-transparent px-3.5 py-2.5 text-[13px] font-medium text-metal-600 transition-colors hover:bg-white hover:text-danger"
              >
                <LogOut className="h-4 w-4 flex-none" strokeWidth={1.75} /> Sign out
              </button>
            </nav>
          </aside>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  )
}
