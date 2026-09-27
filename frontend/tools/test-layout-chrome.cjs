/**
 * Guards the layout chrome rule and prints the full route x auth-state matrix.
 *
 * Rule under test:
 *   - The storefront footer (and the fixed mobile tab bar) render ONLY when the
 *     visitor is signed out AND is not on an authentication screen.
 *   - A signed-in visitor sees no footer on ANY page.
 *
 * This is a static check on Layout.jsx, not a rendered test â€” it verifies the
 * guards exist and are wired to `user`, and that the bare-route list is intact.
 * Run: node tools/test-layout-chrome.cjs
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src')
const layout = fs.readFileSync(path.join(SRC, 'components', 'Layout', 'Layout.jsx'), 'utf8')
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8')

let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed++
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? '   [' + detail + ']' : ''))
}

const flat = layout.replace(/\s+/g, ' ')

console.log('Layout reads the session')
check('useAuth() is imported', /import \{ useAuth \} from '\.\.\/\.\.\/context\/AuthContext'/.test(layout))
check('session is destructured', /const \{ user \} = useAuth\(\)/.test(layout))

console.log('\nFooter is gated on the session')
check('showFooter is declared', /const showFooter = /.test(layout))
check(
  'showFooter requires no user',
  /const showFooter = !bare && !user/.test(flat),
  'hidden for auth screens and for any signed-in user',
)
check('<Footer /> is conditional', /\{showFooter && <Footer \/>\}/.test(layout))
const footerUses = layout.match(/<Footer\s*\/>/g) || []
check('Footer is rendered exactly once', footerUses.length === 1, 'found ' + footerUses.length)
check(
  'that single render is guarded by showFooter',
  /\{showFooter && <Footer \/>\}/.test(layout),
)

console.log('\nMobile tab bar follows the same rule')
check('showMobileNav is declared', /const showMobileNav = /.test(layout))
check('MobileBottomNav is conditional', /\{showMobileNav && \(/.test(layout))
check(
  'main padding is tied to the tab bar',
  /shellActive \? 'flex-1' : showMobileNav \? 'flex-1 pb-16 sm:pb-0' : 'flex-1'/.test(flat),
)

console.log('\nAuthentication screens stay bare')
const BARE = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']
for (const r of BARE) {
  check('bare route ' + r, layout.includes("'" + r + "'"))
}
check('isBareRoute matches prefixes', /pathname\.startsWith\(`\$\{route\}\/`\)/.test(layout))

console.log('\nAccount shell has no site navbar above its sidebar')
check('SHELL_ROUTES is declared', /const SHELL_ROUTES = \[/.test(layout))
check('inShell is computed', /const inShell = matches\(pathname, SHELL_ROUTES\)/.test(layout))
check('shell is session-gated', /const shellActive = inShell && Boolean\(user\)/.test(layout))
check('navbar is gated on shellActive', /const showNavbar = !shellActive/.test(layout))
check('<Navbar /> is conditional', /\{showNavbar && <Navbar /.test(layout))
check('navbar renders exactly once', (layout.match(/<Navbar /g) || []).length === 1)
check('shell is viewport height', /shellActive \? 'flex min-h-svh flex-col'/.test(layout))
check('main is unpadded inside the shell', /shellActive \? 'flex-1' :/.test(layout))
check('chrome-top is driven by navbar visibility', /'--chrome-top': showNavbar \? '68px' : '0px'/.test(layout))
check('search overlay is owned by Layout', (layout.match(/<SearchOverlay /g) || []).length === 1)
check('mobile menu is owned by Layout', (layout.match(/<MobileMenu /g) || []).length === 1)
check('ChromeProvider wraps the app', /<ChromeProvider>/.test(layout))
const chrome = fs.readFileSync(path.join(SRC, 'context', 'ChromeContext.jsx'), 'utf8')
check('ChromeContext exposes openMenu/openSearch', /openMenu:/.test(chrome) && /openSearch:/.test(chrome))
const shellSrc = fs.readFileSync(path.join(SRC, 'components', 'Account', 'AccountShell.jsx'), 'utf8')
check('account shell can open the mobile menu', /onClick=\{openMenu\}/.test(shellSrc))
check('account shell can open search', /onClick=\{openSearch\}/.test(shellSrc))
check('account shell has a hamburger', /aria-label="Open menu"/.test(shellSrc))
check('footer rule unchanged by the shell', /const showFooter = !bare && !user/.test(flat))

console.log('\nEvery sidebar destination keeps the shell')
const shell = fs.readFileSync(path.join(SRC, 'components', 'Account', 'AccountShell.jsx'), 'utf8')
check('AccountShell renders children bare for guests', /if \(!user\) return children/.test(shell))
check('AccountShell renders the rail', /<AccountRail \/>/.test(shell))
const wrapped = ['/shop', '/category/:categorySlug', '/brands', '/brands/:brandSlug', '/categories', '/products/:slug', '/cart', '/checkout', '/track-order', '/payment/callback']
const appLines = app.split('\n')
for (const r of wrapped) {
  const line = appLines.find((l) => l.includes('path="' + r + '"'))
  check('route wrapped in AccountShell: ' + r, Boolean(line) && line.includes('AccountShell'))
}

console.log('\nAccount shell tabs and post-auth landing')
const nav = fs.readFileSync(path.join(SRC, 'components', 'Account', 'AccountNav.jsx'), 'utf8')
const navFlat = nav.replace(/\s+/g, ' ')
check('Home tab is declared', /to: ACCOUNT_HOME, label: 'Home'/.test(nav))
check('Home tab is first in the account section', /export const ACCOUNT_NAV = \[\s*\{ to: ACCOUNT_HOME/.test(nav))
check('Dashboard tab exists', /label: 'Dashboard'/.test(nav))
check('Track Order tab exists', /label: 'Track Order'/.test(nav))
check('Categories tab exists', /label: 'Categories'/.test(nav))
check('Cart tab exists', /label: 'My Cart'/.test(nav))
check('Shop section exists', /export const SHOP_NAV = \[/.test(nav))
check('Home tab is before Dashboard', nav.indexOf("label: 'Home'") < nav.indexOf("label: 'Dashboard'"))
check('Track Order precedes Profile in the account section', nav.indexOf("label: 'Track Order'") < nav.indexOf("label: 'Profile Settings'"))
check('rail carries no email block', !/user\.email/.test(nav))
check('AccountShell mobile header carries no email', !/user\.email/.test(fs.readFileSync(path.join(SRC, 'components', 'Account', 'AccountShell.jsx'), 'utf8')))

const appFlat = app.replace(/\s+/g, ' ')
check('/account/home route is declared', /path="home" element=\{<HomeFeed \/>\}/.test(app))
check('/account/categories route is declared', /path="categories" element=\{<CategoryDirectory \/>\}/.test(app))
check('HomeFeed is code-split', /import\('\.\/pages\/Dashboard\/HomeFeed'\)/.test(app))
check('CategoryDirectory is code-split', /import\('\.\/pages\/Dashboard\/CategoryDirectory'\)/.test(app))
check('ACCOUNT_HOME constant exists', /export const ACCOUNT_HOME = '\/account\/home'/.test(fs.readFileSync(path.join(SRC, 'utils', 'navigation.js'), 'utf8')))
const guards = fs.readFileSync(path.join(SRC, 'components', 'Routing', 'ProtectedRoute.jsx'), 'utf8')
check('guest landing redirects to the Home tab', /if \(user\) return <Navigate to=\{ACCOUNT_HOME\} replace \/>/.test(guards))
check('guards import ACCOUNT_HOME', /ACCOUNT_HOME,/.test(guards))
check('guest-only route also lands on the Home tab', /return <Navigate to=\{safeNext\(next\)\} replace \/>/.test(guards))
check('login defaults to the Home tab', /safeNext\(params\.get\('next'\), ACCOUNT_HOME\)/.test(
  fs.readFileSync(path.join(SRC, 'pages', 'Login', 'Login.jsx'), 'utf8') +
  fs.readFileSync(path.join(SRC, 'pages', 'Register', 'Register.jsx'), 'utf8'),
))

console.log('\nStorefront navbar no longer carries a category strip')
const navbar = fs.readFileSync(path.join(SRC, 'components', 'Navbar', 'Navbar.jsx'), 'utf8')
check('CategoryStrip is removed', !/CategoryStrip/.test(navbar))
check('categoryIcon is no longer imported', !/categoryIcon/.test(navbar))
check('categories are still reachable from the sidebar', /label: 'Categories'/.test(nav))

console.log('\nLanding page stays guest-only')
check('GuestLandingRoute is imported in App', /GuestLandingRoute/.test(app))
check('/ route is wrapped by GuestLandingRoute', /path="\/" element=\{<GuestLandingRoute>/.test(app))

// --- Matrix -------------------------------------------------------------
const ROUTES = [
  ['/', 'Landing (marketing)'],
  ['/shop', 'All products'],
  ['/category/:categorySlug', 'Category listing'],
  ['/brands', 'Brand index'],
  ['/brands/:brandSlug', 'Brand listing'],
  ['/categories', 'Category index'],
  ['/products/:slug', 'Product detail'],
  ['/cart', 'Cart'],
  ['/checkout', 'Checkout'],
  ['/payment/callback', 'Payment callback'],
  ['/account', 'Account shell'],
  ['/account/home', 'Home tab (new arrivals)'],
  ['/account/dashboard', 'Dashboard overview'],
  ['/account/categories', 'Categories tab'],
  ['/account/orders', 'Orders'],
  ['/account/orders/:orderNumber', 'Order detail'],
  ['/account/wishlist', 'Wishlist'],
  ['/account/profile', 'Profile'],
  ['/account/addresses', 'Addresses'],
  ['/wishlist', 'Wishlist (legacy alias)'],
  ['/track-order', 'Track order'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
  ['/shipping', 'Shipping info'],
  ['/returns', 'Returns'],
  ['/faqs', 'FAQs'],
  ['/login', 'Sign in'],
  ['/register', 'Register'],
  ['/forgot-password', 'Forgot password'],
  ['/reset-password/:uid/:token', 'Reset password'],
  ['/verify-email/:uid/:token', 'Verify email'],
  ['* (404)', 'Not found'],
]

const BARE_SET = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'])
const AUTH_ONLY = (r) =>
  r === '/' ||
  r === '/checkout' ||
  r === '/payment/callback' ||
  r === '/wishlist' ||
  r.startsWith('/account')

/** Does the account rail surround this route for a signed-in user? */
const IN_SHELL = (r) =>
  r === '/' ||
  r === '/cart' ||
  r === '/shop' ||
  r === '/categories' ||
  r === '/brands' ||
  r === '/brands/:brandSlug' ||
  r === '/category/:categorySlug' ||
  r === '/products/:slug' ||
  r === '/track-order' ||
  r === '/checkout' ||
  r === '/payment/callback' ||
  r === '/wishlist' ||
  r === '/account' ||
  r.startsWith('/account/')

/** What a visitor actually sees, per auth state. */
function outcome(r, signedIn) {
  if (BARE_SET.has(r)) {
    return signedIn ? 'redirect â†’ Home tab' : 'form, no chrome'
  }
  if (!signedIn) return 'page + navbar + footer'
  if (r === '/') return 'redirect â†’ Home tab'
  return IN_SHELL(r) ? 'page + rail' : 'page, no footer'
}

const w = (s, n) => String(s).padEnd(n)
const l = (s, n) => String(s).padStart(n)

console.log('\nROUTE x AUTH MATRIX')
console.log('  ' + w('route', 30) + w('guard', 12) + l('signed out', 26) + l('signed in', 30))
console.log('  ' + '-'.repeat(98))
for (const [r, label] of ROUTES) {
  const guard = BARE_SET.has(r) ? 'guest-only' : AUTH_ONLY(r) ? (r === '/' ? 'guest-only' : 'auth-only') : 'public'
  console.log('  ' + w(r, 30) + w(guard, 12) + l(outcome(r, false), 26) + l(outcome(r, true), 30) + label)
}
console.log('\n  Footer renders ONLY in the "page + footer" column above.')
console.log('  Mobile tab bar follows the identical rule.')

console.log(failed === 0 ? '\nPASS - layout chrome rule intact' : '\nFAIL - ' + failed + ' check(s)')
process.exit(failed ? 1 : 0)
