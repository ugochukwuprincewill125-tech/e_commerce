import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, Box, Tags, Award, ReceiptText, Users, Star, MessageSquare,
  TicketPercent, LogOut, Store, TrendingUp, ExternalLink, X, Menu, Plus, PackageSearch, Clock3,
} from 'lucide-react'

import { useAuth } from '../../context/AuthContext'

/**
 * The admin chrome is its own application — no customer navbar. Navigation is
 * grouped the way a store works: what do I owe people, what do I sell, who do
 * I sell to, and the numbers behind all of it. Orders get sub-tabs so the
 * common fulfilment views are one click deep instead of three filters deep.
 */
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: BarChart3, exact: true }],
  },
  {
    label: 'Selling',
    items: [
      { to: '/admin/orders', label: 'All orders', icon: ReceiptText, exact: true, fallback: true },
      { to: '/admin/orders?status=processing', label: 'In progress', icon: PackageSearch, params: true },
      { to: '/admin/orders?payment=pending', label: 'Awaiting payment', icon: Clock3, params: true },
      { to: '/admin/customers', label: 'Customers', icon: Users, exact: true },
      { to: '/admin/messages', label: 'Messages', icon: MessageSquare, exact: true },
    ],
  },
  {
    label: 'Catalogue',
    upload: true,
    items: [
      { to: '/admin/products', label: 'All products', icon: Box, exact: true, fallback: true },
      { to: '/admin/products/new', label: 'Upload product', icon: Plus, params: true },
      { to: '/admin/categories', label: 'Categories', icon: Tags, exact: true },
      { to: '/admin/brands', label: 'Brands', icon: Award, exact: true },
      { to: '/admin/coupons', label: 'Coupons', icon: TicketPercent, exact: true },
    ],
  },
  {
    label: 'Community',
    items: [{ to: '/admin/reviews', label: 'Reviews', icon: Star, exact: true }],
  },
  {
    label: 'Insight',
    items: [{ to: '/admin/reports', label: 'Reports', icon: TrendingUp, exact: true }],
  },
]

/** Row styling for a sidebar entry; `active` decides the fill. */
const linkClass = (active) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
    active ? 'bg-amber-500 text-ink-950' : 'text-neutral-300 hover:bg-white/10 hover:text-white'
  }`

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [drawer, setDrawer] = useState(false)

  const signOut = async () => {
    await logout()
    navigate('/')
  }

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawer(false)
  }, [pathname, search])

  const currentParams = new URLSearchParams(search)

  /** Active if the path matches and every ?key=value in the target matches. */
  const isPathActive = (item) => {
    const [toPath, toSearch] = item.to.split('?')
    const toParams = new URLSearchParams(toSearch || '')
    // An "All …" fallback entry also lights up on sibling detail pages
    // (/admin/products/12/edit) where no specific sub-tab matches.
    const pathOk = item.fallback
      ? pathname === toPath || pathname.startsWith(`${toPath}/`)
      : item.params || item.exact
        ? pathname === toPath
        : pathname.startsWith(toPath)
    return pathOk && [...toParams.entries()].every(([k, v]) => currentParams.get(k) === v)
  }

  const renderNav = (onNavigate) => (
    <>
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6 text-white">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-amber-500">
          <Store className="h-4 w-4 text-ink-950" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-wide">TIMELINE ADMIN</p>
          <p className="text-[11px] text-neutral-400">Store control centre</p>
        </div>
        <button
          type="button"
          onClick={onNavigate}
          className="ml-auto rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          // A plain "All orders"/"All products" entry stays dark while one of
          // its filtered sub-tabs is highlighted.
          const flags = group.items.map(isPathActive)
          const anySubActive = group.items.some((item, i) => item.params && flags[i])
          return (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item, i) => {
                  const active = item.fallback ? flags[i] && !anySubActive : flags[i]
                  return (
                    <Link key={item.to} to={item.to} onClick={onNavigate} className={linkClass(active)}>
                      <item.icon className="h-4 w-4 flex-none" strokeWidth={2} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
                {group.upload && (
                  <Link
                    to="/admin/products/new"
                    onClick={onNavigate}
                    className="mt-1 flex items-center justify-center gap-2 rounded-md border border-dashed border-white/25 px-3 py-2 text-sm font-semibold text-amber-400 transition hover:border-amber-400 hover:bg-white/5 hover:text-amber-300"
                  >
                    <Plus className="h-4 w-4" /> Upload product
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-xs text-neutral-400">{user?.email}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-1.5 text-[13px] font-semibold text-neutral-300 transition hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" /> View store
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-400 transition hover:text-amber-300"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-metal-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-none flex-col bg-ink-950 text-neutral-300 md:flex">
        {renderNav(() => {})}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-ink-950/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink-950 text-neutral-300 shadow-overlay">
            {renderNav(() => setDrawer(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim mobile bar only — desktop has no top navbar at all. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="rounded p-2 text-ink-900 transition hover:bg-metal-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-950">
              <Store className="h-3.5 w-3.5 text-amber-400" />
            </span>
            <span className="text-[13px] font-bold tracking-wide text-ink-950">ADMIN</span>
          </span>
          <button type="button" onClick={signOut} className="text-[13px] font-semibold text-danger">
            Sign out
          </button>
        </header>

        {/* One centered column, capped and generously padded, so tables line
            up page-to-page instead of reflowing. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
