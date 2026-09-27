import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3, Box, Tags, Award, ReceiptText, Users, Star, MessageSquare,
  TicketPercent, LogOut, Store,
} from 'lucide-react'

import { useAuth } from '../../context/AuthContext'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/admin/products', label: 'Products', icon: Box },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/brands', label: 'Brands', icon: Award },
  { to: '/admin/orders', label: 'Orders', icon: ReceiptText },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { to: '/admin/coupons', label: 'Coupons', icon: TicketPercent },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="hidden w-60 flex-none flex-col bg-ink-950 text-neutral-300 md:flex">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Store className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-bold tracking-wide">TIMELINE ADMIN</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
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
          <button
            onClick={() => logout().then(() => navigate('/'))}
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <span className="text-sm font-bold">Timeline Admin</span>
          <button onClick={() => logout().then(() => navigate('/'))} className="text-sm font-semibold text-red-600">
            Sign out
          </button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 md:hidden">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-ink-950 text-white' : 'bg-neutral-100 text-neutral-600'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
