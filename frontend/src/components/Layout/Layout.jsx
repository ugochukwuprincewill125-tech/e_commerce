import { useLocation } from 'react-router-dom'

import { ChromeProvider, useChrome } from '../../context/ChromeContext'
import { useAuth } from '../../context/AuthContext'
import CartDrawer from '../CartDrawer/CartDrawer'
import Footer from '../Footer/Footer'
import MobileMenu from '../Navbar/MobileMenu'
import MobileBottomNav from '../Navbar/MobileBottomNav'
import Navbar from '../Navbar/Navbar'
import { SearchOverlay } from '../Navbar/Navbar'
import { MEMBER_LINKS, GUEST_LINKS } from '../../utils/navConfig'

/**
 * Authentication screens are intentionally chrome-light: navbar and form only.
 */
const BARE_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']

/**
 * Routes rendered inside the account shell. For a signed-in user these render
 * no site navbar, because the shell's own sidebar owns the full viewport
 * height. A signed-out visitor still gets the normal navbar and footer.
 */
const SHELL_ROUTES = [
  '/account',
  '/cart',
  '/shop',
  '/category',
  '/brands',
  '/categories',
  '/products',
  '/track-order',
  '/checkout',
  '/payment',
  '/wishlist',
]

const matches = (pathname, routes) => routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))

/** Overlays live here so both the navbar and the account shell can open them. */
function Chrome({ children, bare, showFooter, showMobileNav, showNavbar }) {
  const { user } = useAuth()
  const { menuOpen, closeMenu, searchOpen, closeSearch, openSearch } = useChrome()

  return (
    <>
      {children}

      {showFooter && <Footer />}
      {showMobileNav && (
        <>
          <div className="h-16 sm:hidden" aria-hidden />
          <MobileBottomNav onOpenSearch={openSearch} />
        </>
      )}

      <CartDrawer />
      <MobileMenu open={menuOpen} onClose={closeMenu} links={user ? MEMBER_LINKS : GUEST_LINKS} />
      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </>
  )
}

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const { user } = useAuth()

  const bare = matches(pathname, BARE_ROUTES)
  const inShell = matches(pathname, SHELL_ROUTES)

  // The account shell only takes over for a signed-in user; guests keep the
  // storefront navbar on these same routes.
  const shellActive = inShell && Boolean(user)

  // The marketing footer belongs to the signed-out storefront only. It is
  // hidden on authentication screens, and on every page once a session
  // exists — a signed-in user never sees the promotional footer.
  const showFooter = !bare && !user

  // The fixed mobile tab bar is the mobile equivalent of that footer, so it
  // follows exactly the same rule.
  const showMobileNav = showFooter

  // No navbar over the account shell: its sidebar owns the full viewport height.
  const showNavbar = !shellActive

  return (
    <ChromeProvider>
      <div className={shellActive ? 'flex min-h-svh flex-col' : 'flex min-h-screen flex-col'}>
        {!shellActive && (
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to content
          </a>
        )}

        {showNavbar && <Navbar />}

        {/* Reserve room for the fixed mobile tab bar only when it is rendered.
            --chrome-top lets sticky elements clear whatever chrome is present. */}
        <main
          id="main"
          className={shellActive ? 'flex-1' : showMobileNav ? 'flex-1 pb-16 sm:pb-0' : 'flex-1'}
          style={{ '--chrome-top': showNavbar ? '68px' : '0px' }}
        >
          {children}
        </main>

        <Chrome bare={bare} showFooter={showFooter} showMobileNav={showMobileNav} showNavbar={showNavbar} />
      </div>
    </ChromeProvider>
  )
}
