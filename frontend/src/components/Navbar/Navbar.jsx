import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Heart, LayoutDashboard, LogOut, Menu, Package, Search, ShoppingCart, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { useChrome } from '../../context/ChromeContext'
import { useCart } from '../../context/CartContext'
import { useWishlist } from '../../context/WishlistContext'
import { catalogService } from '../../services/productService'
import { cn } from '../../utils/format'
import { GUEST_LINKS, MEMBER_LINKS } from '../../utils/navConfig'
import Logo from '../Logo/Logo'
import SearchBar from '../SearchBar/SearchBar'



function CountBadge({ count, bumpKey }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={bumpKey}
          initial={{ scale: 0.4 }}
          animate={{ scale: [1.3, 1] }}
          exit={{ scale: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** Jumia-style account block: stacked greeting + action, with a dropdown. */
function AccountBlock() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!user) {
    return (
      <Link to="/login" className="flex items-center gap-2.5 px-1 py-1.5 text-left">
        <User className="h-5 w-5 flex-none text-ink-800" strokeWidth={1.75} />
        <span className="hidden leading-tight sm:block">
          <span className="block text-[11px] text-metal-500">Hello,</span>
          <span className="block text-[13px] font-semibold text-ink-900">Sign in</span>
        </span>
      </Link>
    )
  }

  const items = [
    { to: '/account', label: 'My Account', icon: LayoutDashboard },
    { to: '/account/orders', label: 'My Orders', icon: Package },
    { to: '/account/wishlist', label: 'My Wishlist', icon: Heart },
    { to: '/account/profile', label: 'Profile Settings', icon: User },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 px-1 py-1.5 text-left"
      >
        <span className="flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full bg-ink-900 text-[11px] font-bold text-white">
          {user.profile_image ? <img src={user.profile_image} alt="" className="h-full w-full object-cover" /> : `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[11px] text-metal-500">Hello,</span>
          <span className="block max-w-[110px] truncate text-[13px] font-semibold text-ink-900">{user.first_name}</span>
        </span>
        <ChevronDown className={cn('hidden h-3.5 w-3.5 text-metal-400 transition-transform sm:block', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.13 }}
            className="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-lg border border-line bg-white p-1.5 shadow-overlay"
          >
            <div className="border-b border-line px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-ink-900">{user.full_name}</p>
              <p className="truncate text-xs text-metal-400">{user.email}</p>
            </div>
            <div className="py-1">
              {items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded px-3 py-2 text-sm text-ink-800 transition-colors hover:bg-metal-50 hover:text-ink-900"
                >
                  <Icon className="h-4 w-4 text-metal-500" strokeWidth={1.75} /> {label}
                </Link>
              ))}
            </div>
            <div className="border-t border-line pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false)
                  // Navigate first: clearing the session while still on a
                  // protected route would make the guard bounce to /login
                  // before we get to the landing page.
                  navigate('/')
                  await logout()
                }}
                className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm text-danger transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} /> Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Jumia-style category selector attached to the search field. */
function SearchWithCategory({ onNavigate, className }) {
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'root'],
    queryFn: () => catalogService.categories({ root: true }),
    staleTime: 600_000,
  })
  const [scope, setScope] = useState('')

  useEffect(() => {
    if (!scope || !categories.some((c) => c.slug === scope)) setScope('')
  }, [categories, scope])

  return (
    <div className={cn('flex min-w-0 flex-1 items-stretch', className)}>
      <label className="sr-only" htmlFor="search-scope">
        Search within category
      </label>
      <div className="relative hidden w-44 flex-none sm:block">
        <select
          id="search-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-11 w-full appearance-none rounded-l-md border border-r-0 border-line bg-metal-50 pl-3.5 pr-8 text-[13px] font-medium text-ink-800 focus:border-ink-900 focus:ring-0"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-metal-500" />
      </div>
      <SearchBar className="min-w-0 flex-1" scope={scope} grouped onNavigate={onNavigate} />
    </div>
  )
}

export default function Navbar() {
  const { user } = useAuth()
  const { openMenu, openSearch } = useChrome()
  const { itemCount, openDrawer, bump } = useCart()
  const { count: wishCount } = useWishlist()
  const { pathname } = useLocation()

  const navLinks = user ? MEMBER_LINKS : GUEST_LINKS

  return (
    <>
      {/* Main header */}
      <header className="sticky top-0 z-50 border-b border-line bg-white">
        <div className="container flex h-16 items-center gap-4 lg:h-[68px] lg:gap-6">
          <button type="button" onClick={openMenu} className="-ml-2 flex h-10 w-10 flex-none items-center justify-center rounded text-ink-900 transition-colors hover:bg-metal-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <Logo />

          {/* Scoped search + SEARCH button */}
          <div className="hidden min-w-0 flex-1 items-stretch md:flex">
            <SearchWithCategory />
            <Link
              to="/shop"
              className="flex h-11 flex-none items-center gap-2 rounded-r-md bg-brand-600 px-7 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-700"
            >
              <Search className="h-4 w-4" strokeWidth={2.25} />
              Search
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <button type="button" onClick={openSearch} className="flex h-10 w-10 flex-none items-center justify-center rounded text-ink-800 transition-colors hover:bg-metal-100 md:hidden" aria-label="Search">
              <Search className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <Link to="/account/wishlist" className="relative hidden h-10 w-10 items-center justify-center rounded text-ink-800 transition-colors hover:bg-metal-100 lg:flex" aria-label={`Wishlist (${wishCount})`}>
              <Heart className="h-5 w-5" strokeWidth={1.75} />
              <CountBadge count={wishCount} bumpKey={wishCount} />
            </Link>

            <div className="hidden lg:block">
              <AccountBlock />
            </div>

            <span className="hidden h-8 w-px bg-line lg:block" aria-hidden />

            <button
              type="button"
              onClick={openDrawer}
              className="relative flex items-center gap-2 rounded px-1 py-1.5 text-ink-900 transition-colors hover:bg-metal-50"
              aria-label={`Cart (${itemCount} items)`}
            >
              <span className="relative">
                <motion.span key={bump} animate={bump ? { rotate: [0, -12, 10, -5, 0] } : undefined} transition={{ duration: 0.4 }} className="block">
                  <ShoppingCart className="h-6 w-6" strokeWidth={1.6} />
                </motion.span>
                <CountBadge count={itemCount} bumpKey={`${itemCount}-${bump}`} />
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[11px] text-metal-500">Cart</span>
                <span className="block text-[13px] font-semibold tabular-nums text-ink-900">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
              </span>
            </button>
          </div>
        </div>
      </header>
    </>
  )
}

const SUGGESTED = ['iPhone', 'Samsung', 'Laptop', 'Power bank', 'Earbuds', 'Router']

export function SearchOverlay({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75]">
          <motion.div className="absolute inset-0 bg-ink-950/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative border-b border-line bg-white px-4 pb-5 pt-4 shadow-overlay sm:px-6"
            role="dialog"
            aria-label="Search"
          >
            <div className="container flex items-stretch gap-0">
              <SearchWithCategory onNavigate={onClose} className="flex-1" />
              <Link
                to="/shop"
                onClick={onClose}
                className="flex h-11 flex-none items-center gap-2 rounded-r-md bg-brand-600 px-6 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-700"
              >
                <Search className="h-4 w-4" strokeWidth={2.25} />
                Search
              </Link>
              <button type="button" onClick={onClose} className="ml-3 flex h-11 w-11 flex-none items-center justify-center rounded text-ink-800 hover:bg-metal-100" aria-label="Close search">
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="container mt-4 flex flex-wrap items-center gap-2">
              <span className="eyebrow-plain">Popular searches</span>
              {SUGGESTED.map((t) => (
                <Link
                  key={t}
                  to={`/shop?q=${encodeURIComponent(t)}`}
                  onClick={onClose}
                  className="rounded border border-line px-2.5 py-1 text-xs font-medium text-metal-600 transition-colors hover:border-ink-900 hover:text-ink-900"
                >
                  {t}
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
