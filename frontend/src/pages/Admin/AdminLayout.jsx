import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, Box, Tags, Award, ReceiptText, Users, Star, MessageSquare,
  TicketPercent, LogOut, Store, TrendingUp, ExternalLink,
} from 'lucide-react'

import { useAuth } from '../../context/AuthContext'

// Fulfilment first: orders are the thing staff open most, then the catalogue,
// then everything else. Reports sit next to the dashboard because it is a
// read-only view of the same numbers.
const NAV = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ReceiptText },
  { to: '/admin/products', label: 'Products', icon: Box },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/brands', label: 'Brands', icon: Award },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { to: '/admin/coupons', label: 'Coupons', icon: TicketPercent },
  { to: '/admin/reports', label: 'Reports', icon: TrendingUp },
]

/** Map a pathname back to its nav entry so the header can name the section. */
function titleFor(pathname) {
  if (pathname === '/admin') return 'Dashboard'
  const hit = [...NAV].reverse().find((n) => pathname.startsWith(n.to))
  return hit?.label || 'Admin'
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const signOut = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen bg-metal-50">
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col bg-ink-950 text-neutral-300 md:flex">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Store className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-bold tracking-wide">TIMELINE ADMIN</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-amber-500 text-ink-950' : 'hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-xs text-neutral-400">{user?.email}</p>
          <Link
            to="/"
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-neutral-300 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" /> View store
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <h1 className="truncate font-display text-base font-bold text-ink-950">{titleFor(pathname)}</h1>
            <div className="flex items-center gap-3">
              <Link to="/" className="hidden items-center gap-1.5 text-[13px] font-semibold text-metal-600 hover:text-ink-900 sm:flex">
                <ExternalLink className="h-3.5 w-3.5" /> View store
              </Link>
              <button type="button" onClick={signOut} className="text-[13px] font-semibold text-danger md:hidden">
                Sign out
              </button>
            </div>
          </div>
          <nav className="scrollbar-none flex gap-1 overflow-x-auto border-t border-line px-2 py-2 md:hidden">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    isActive ? 'bg-ink-950 text-white' : 'bg-metal-100 text-metal-600'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
