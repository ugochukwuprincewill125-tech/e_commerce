import { useLocation } from 'react-router-dom'

import { ChromeProvider, useChrome } from '../../context/ChromeContext'
import { useAuth } from '../../context/AuthContext'
import { ACCOUNT_NAV, SHOP_NAV } from '../Account/AccountNav'
import CartDrawer from '../CartDrawer/CartDrawer'
import Footer from '../Footer/Footer'
import MobileMenu from '../Navbar/MobileMenu'
import Navbar from '../Navbar/Navbar'
import { SearchOverlay } from '../Navbar/Navbar'
import { GUEST_LINKS, MEMBER_LINKS } from '../../utils/navConfig'

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

/**
 * The hamburger is the single source of navigation on small screens.
 *
 * A signed-in user therefore gets every destination the account sidebar
 * offers — the rail is `hidden lg:block`, so on a phone it would otherwise be
 * unreachable — grouped to mirror the rail. A guest gets the storefront links.
 * The storefront's About/Contact pages are appended for members because the
 * marketing footer is hidden once a session exists, which would otherwise
 * leave those two pages unreachable on a phone.
 */
function menuSections(user) {
  if (!user) return [{ title: null, links: GUEST_LINKS }]
  return [
    { title: 'My account', links: ACCOUNT_NAV },
    { title: 'Shop', links: SHOP_NAV },
    { title: 'Company', links: MEMBER_LINKS.filter((l) => l.to === '/about' || l.to === '/contact') },
  ]
}

/** Overlays live here so both the navbar and the account shell can open them. */
function Chrome({ children, bare, showFooter, showNavbar }) {
  const { user } = useAuth()
  const { menuOpen, closeMenu, searchOpen, closeSearch } = useChrome()

  return (
    <>
      {children}

      {showFooter && <Footer />}

      <CartDrawer />
      <MobileMenu open={menuOpen} onClose={closeMenu} sections={menuSections(user)} />
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

  // There is no fixed mobile tab bar. Every destination lives in the hamburger
  // instead, so nothing needs reserving at the bottom of the page.

  // No navbar over the account shell: its sidebar owns the full viewport height.
  // Auth screens render with no chrome at all — just the form.
  const showNavbar = !shellActive && !bare

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

        {/* No bottom bar, so no reserved gutter. --chrome-top lets sticky
            elements clear whatever chrome is present. */}
        <main
          id="main"
          className="flex-1"
          style={{ '--chrome-top': showNavbar ? '68px' : '0px' }}
        >
          {children}
        </main>

        <Chrome bare={bare} showFooter={showFooter} showNavbar={showNavbar} />
      </div>
    </ChromeProvider>
  )
}
