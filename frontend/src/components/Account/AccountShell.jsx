import { Menu, Search, ShoppingCart } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { useChrome } from '../../context/ChromeContext'
import AccountNav, { AccountRail, activeLabel } from './AccountNav'

/**
 * Account shell — the coloured rail plus a content column, with no site navbar
 * above it. The rail runs the full height of the viewport and everything else
 * is offset into the column to its right.
 *
 * Used for every route the sidebar can reach, so navigating between Cart,
 * Track Order, Brands and the account tabs never drops the sidebar. For a
 * signed-out visitor the children render bare, because this is also used to
 * wrap public storefront pages.
 */
export default function AccountShell({ children }) {
  const { user } = useAuth()
  const { itemCount, openDrawer } = useCart()
  const { openMenu, openSearch } = useChrome()
  const location = useLocation()

  // Guests get the plain page — no rail, no account chrome.
  if (!user) return children

  return (
    <div className="flex min-h-svh">
      <AccountRail />

      <div className="flex min-w-0 flex-1 flex-col bg-metal-50">
        {/* Mobile bar: hamburger, greeting, search, cart — the account shell has
            no site navbar, so these controls live here instead. */}
        <div className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              type="button"
              onClick={openMenu}
              className="flex h-10 w-10 flex-none items-center justify-center rounded text-ink-900 transition-colors hover:bg-metal-100"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <div className="min-w-0 flex-1 px-1">
              <p className="truncate text-[14px] font-semibold leading-tight text-ink-900">Hello, {user.first_name}</p>
              <p className="truncate text-[11px] leading-tight text-metal-500">{activeLabel(location.pathname)}</p>
            </div>

            <button
              type="button"
              onClick={openSearch}
              className="flex h-10 w-10 flex-none items-center justify-center rounded text-ink-800 transition-colors hover:bg-metal-100"
              aria-label="Search"
            >
              <Search className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={openDrawer}
              className="relative flex h-10 w-10 flex-none items-center justify-center rounded text-ink-800 transition-colors hover:bg-metal-100"
              aria-label={`Cart (${itemCount} items)`}
            >
              <ShoppingCart className="h-5 w-5" strokeWidth={1.75} />
              {itemCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-4 text-white">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </div>
          <AccountNav variant="strip" />
        </div>

        {/* Page header, offset right of the rail */}
        <div className="hidden items-center gap-3 border-b border-line bg-white px-6 py-4 lg:flex">
          <h1 className="text-[19px] font-semibold tracking-tight text-ink-900">My Account</h1>
          <span className="text-metal-300">/</span>
          <span className="text-[13px] text-metal-500">{activeLabel(location.pathname)}</span>
        </div>

        <div className="flex-1 p-5 lg:p-6">{children}</div>
      </div>
    </div>
  )
}
