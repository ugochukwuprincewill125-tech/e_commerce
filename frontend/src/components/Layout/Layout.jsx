import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import CartDrawer from '../CartDrawer/CartDrawer'
import Footer from '../Footer/Footer'
import MobileBottomNav from '../Navbar/MobileBottomNav'
import Navbar, { SearchOverlay } from '../Navbar/Navbar'

/**
 * Authentication screens are intentionally chrome-light: navbar and form only.
 * No site footer and no mobile tab bar competing with the form.
 */
const BARE_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']

function isBareRoute(pathname) {
  return BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export default function Layout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { pathname } = useLocation()
  const bare = isBareRoute(pathname)

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <Navbar onOpenSearch={() => setSearchOpen(true)} />

      <main id="main" className={bare ? 'flex-1' : 'flex-1 pb-16 sm:pb-0'}>
        {children}
      </main>

      {!bare && <Footer />}
      {!bare && <div className="h-16 sm:hidden" aria-hidden />}
      {!bare && <MobileBottomNav onOpenSearch={() => setSearchOpen(true)} />}

      <CartDrawer />
      {/* Search is triggered from the navbar, so the overlay stays available. */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
