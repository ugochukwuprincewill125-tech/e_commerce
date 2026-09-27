import {
  ArrowLeft,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  Package,
  Search,
  ShoppingCart,
  Store,
  Truck,
  User,
} from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import Logo from '../Logo/Logo'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { cn } from '../../utils/format'
import { ACCOUNT_HOME } from '../../utils/navigation'

/** Account section — everything about this customer's own data. */
export const ACCOUNT_NAV = [
  { to: ACCOUNT_HOME, label: 'Home', icon: LayoutGrid, end: true },
  { to: '/account', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/account/orders', label: 'My Orders', icon: Package },
  { to: '/track-order', label: 'Track Order', icon: Truck },
  { to: '/account/wishlist', label: 'My Wishlist', icon: Heart },
  { to: '/cart', label: 'My Cart', icon: ShoppingCart, badge: 'cart' },
  { to: '/account/addresses', label: 'Saved Addresses', icon: MapPin },
  { to: '/account/profile', label: 'Profile Settings', icon: User },
]

/** Storefront section — shortcuts for getting back to browsing. */
export const SHOP_NAV = [
  { to: '/account/categories', label: 'Categories', icon: Store },
  { to: '/brands', label: 'Brands', icon: Search },
  { to: '/shop', label: 'All Products', icon: ArrowLeft },
]

export const ALL_NAV = [...ACCOUNT_NAV, ...SHOP_NAV]

/** Does `pathname` belong to this nav entry? */
function isCurrent(item, pathname) {
  if (item.end) return pathname === item.to
  if (item.to === '/account') return false // handled by its own `end` entry
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** Human label for the account header trail. */
export function activeLabel(pathname) {
  const hit = ALL_NAV.find((n) => isCurrent(n, pathname))
  return hit?.label || 'Dashboard'
}

/**
 * Account navigation, rendered two ways from one source of truth:
 *  - `rail`  — the full-height coloured sidebar (large screens)
 *  - `strip` — a horizontal scroller (small screens, where a rail is unusable)
 */
export default function AccountNav({ variant }) {
  const { logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()

  const signOut = async () => {
    // Navigate before clearing the session: dropping auth while still on a
    // protected route would let the route guard bounce to /login first.
    navigate('/')
    await logout()
  }

  const badge = (item) =>
    item.badge === 'cart' && itemCount > 0 ? (
      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
        {itemCount > 99 ? '99+' : itemCount}
      </span>
    ) : null

  const linkClass = (active, rail) =>
    cn(
      'flex items-center gap-2.5 rounded border-l-2 text-[13px] font-medium transition-colors',
      rail ? 'px-3.5 py-2.5' : 'px-3 py-2',
      active
        ? rail
          ? 'border-brand-400 bg-white/10 text-white'
          : 'border-ink-900 bg-ink-900 text-white'
        : rail
          ? 'border-transparent text-metal-400 hover:bg-white/5 hover:text-white'
          : 'border-line bg-white text-metal-600 hover:border-ink-900 hover:text-ink-900',
    )

  if (variant === 'strip') {
    return (
      <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 py-2" aria-label="Account">
        {ALL_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkClass(isActive, false)}>
            <item.icon className="h-4 w-4 flex-none" strokeWidth={1.75} />
            {item.label}
            {badge(item)}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={signOut}
          className="flex flex-none items-center gap-2 whitespace-nowrap rounded border border-line bg-white px-3 py-2 text-[13px] font-medium text-metal-600 transition-colors hover:border-danger hover:text-danger"
        >
          <LogOut className="h-4 w-4 flex-none" strokeWidth={1.75} /> Sign out
        </button>
      </nav>
    )
  }

  return (
    <nav className="flex flex-col gap-5" aria-label="Account">
      <div>
        <p className="eyebrow-plain mb-2 text-metal-600">My account</p>
        <div className="flex flex-col gap-0.5">
          {ACCOUNT_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkClass(isActive, true)}>
              <item.icon className="h-4 w-4 flex-none" strokeWidth={1.75} />
              {item.label}
              {badge(item)}
            </NavLink>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow-plain mb-2 text-metal-600">Shop</p>
        <div className="flex flex-col gap-0.5">
          {SHOP_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => linkClass(isActive, true)}>
              <item.icon className="h-4 w-4 flex-none" strokeWidth={1.75} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

/** The full-height coloured rail. Owns the viewport from top to bottom. */
export function AccountRail() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const signOut = async () => {
    navigate('/')
    await logout()
  }

  return (
      <aside className="pinned-panel pinned-panel-flush hidden w-[264px] flex-none border-r border-line bg-ink-950 lg:block">
        <div className="flex h-full flex-col overflow-y-auto overscroll-contain p-5">

        <div className="border-b border-white/10 pb-5">
          <Logo onDark size="sm" />
        </div>

        <div className="mt-6 flex-1">
          <AccountNav variant="rail" />
        </div>

        <div className="mt-6 border-t border-white/10 pt-4">
          <Link
            to="/shop"
            className="flex items-center gap-2 rounded border border-white/20 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:border-white hover:bg-white hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4 flex-none" strokeWidth={1.75} />
            Back to store
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 flex w-full items-center gap-2 rounded px-3 py-2 text-[13px] font-medium text-metal-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4 flex-none" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
