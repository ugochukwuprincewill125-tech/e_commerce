/**
 * Mobile UX audit — the checks that must hold for the phone experience.
 * Run: node tools/audit-mobile-ux.cjs
 *
 * This is deliberately narrow. `audit-mobile.cjs` reports advisory patterns
 * (fixed widths, hover-only reveals, raw tables) as hints to inspect. This file
 * only asserts things that are unambiguous defects, so it can fail the build
 * without crying wolf.
 *
 * Contract:
 *   1. One navigation surface on a phone: the hamburger. No fixed bottom bar.
 *   2. Anything hidden behind a `lg:` sidebar must be reachable in the drawer.
 *   3. Touch targets on the primary mobile controls are >= 40px.
 *   4. Form controls are >= 16px on mobile, or iOS zooms the page on focus.
 *   5. Fixed bottom elements clear the home indicator via a safe-area inset.
 *   6. The page must not be able to pan sideways.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const read = (p) => fs.readFileSync(p, 'utf8')
const rel = (p) => path.relative(SRC, p).replace(/\\/g, '/')
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsx')) out.push(p)
  }
  return out
}

let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed++
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? '   [' + detail + ']' : ''))
}

const files = walk(SRC)
const css = read(path.join(SRC, 'index.css'))
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
const layout = read(path.join(SRC, 'components', 'Layout', 'Layout.jsx'))
const menu = read(path.join(SRC, 'components', 'Navbar', 'MobileMenu.jsx'))
const shell = read(path.join(SRC, 'components', 'Account', 'AccountShell.jsx'))
const navbar = read(path.join(SRC, 'components', 'Navbar', 'Navbar.jsx'))
const html = read(path.join(ROOT, 'index.html'))

/* ---- 1. one navigation surface ---- */
console.log('Rule 1 - the hamburger is the only mobile nav surface')
check('no MobileBottomNav component remains', !fs.existsSync(path.join(SRC, 'components', 'Navbar', 'MobileBottomNav.jsx')))
check('Layout does not import it', !/MobileBottomNav/.test(layout))
check('no bottom-bar spacer is reserved', !/h-16 sm:hidden/.test(layout) && !/pb-16/.test(layout))
check('no file renders a fixed bottom tab bar', !files.some((f) => /MobileBottomNav/.test(read(f))))
{
  // Any element that is fixed to the bottom and covers the full width is a
  // bottom bar. Only the product page's buy bar qualifies, and it is a page
  // affordance, not navigation.
  const bars = []
  for (const f of files) {
    const src = read(f)
    if (/className="[^"]*\bfixed\b[^"]*\bbottom-0\b[^"]*"/.test(src) && !/pb-safe/.test(src)) {
      bars.push(rel(f))
    }
  }
  check('fixed bottom elements clear the home indicator', bars.length === 0, bars.join(', '))
}

/* ---- 2. sidebar contents reachable on mobile ---- */
console.log('\nRule 2 - sidebar destinations are in the drawer')
{
  const nav = read(path.join(SRC, 'components', 'Account', 'AccountNav.jsx'))
  const account = (nav.match(/export const ACCOUNT_NAV = \[([\s\S]*?)\]/) || [])[1] || ''
  const shopNav = (nav.match(/export const SHOP_NAV = \[([\s\S]*?)\]/) || [])[1] || ''
  const links = (block) => [...block.matchAll(/to:\s*'([^']+)'/g)].map((m) => m[1])
  const sidebarDestinations = [...links(account), ...links(shopNav)]
  check('sidebar exposes its link arrays', sidebarDestinations.length > 0, sidebarDestinations.length + ' links')

  const sections = (layout.match(/function menuSections\(user\)[\s\S]*?\n\}/) || [])[0] || ''
  check('Layout imports the sidebar arrays', /ACCOUNT_NAV, SHOP_NAV/.test(layout))
  check('members get the account section', /title: 'My account', links: ACCOUNT_NAV/.test(sections))
  check('members get the shop section', /title: 'Shop', links: SHOP_NAV/.test(sections))
  check('guests get the storefront links', /links: GUEST_LINKS/.test(sections))
  check('the drawer receives the sections', /sections=\{menuSections\(user\)\}/.test(layout))
  check('drawer renders every section', /sections\.map\(/.test(menu))
  check('the rail is hidden below lg', /<aside className="[^"]*\bhidden\b[^"]*lg:block/.test(nav))
  check('no duplicate horizontal link strip on mobile', !/variant="strip"/.test(shell))
  check('About and Contact stay reachable for members', /l\.to === '\/about' \|\| l\.to === '\/contact'/.test(sections))
}

/* ---- 3. touch targets ---- */
console.log('\nRule 3 - primary mobile controls are at least 40px')
{
  // The two mobile bars (account shell and the storefront navbar) hold the
  // hamburger, search and cart. Those are the controls a thumb has to hit.
  const controls = (src) => [...src.matchAll(/className="([^"]*(?:h-\d+|tap[\w-]*)[^"]*)"[^>]*aria-label="([^"]+)"/g)]
  const TAILWIND_H = (n) => n * 4 // h-N is N*4px
  const judge = (cls) => {
    const h = cls.match(/\bh-(\d+)\b/)
    if (h) return TAILWIND_H(Number(h[1])) >= 40
    // `.tap` is 44px and `.tap-sm` is 40px, both defined in index.css.
    if (/\btap(-sm)?\b/.test(cls)) return true
    return null // no height utility to judge
  }
  const bad = []
  for (const [cls, label] of [...controls(shell), ...controls(navbar)]) {
    const verdict = judge(cls)
    if (verdict === false) bad.push(`${label} (${cls.match(/\bh-\d+\b/)?.[0] || '?'})`)
  }
  check('shell + navbar mobile controls are >= 40px', bad.length === 0, bad.join(', '))
  check('drawer rows are touch sized', /min-h-\[44px\]/.test(menu))
  check('drawer close button is touch sized', /p-2/.test(menu) && /aria-label="Close menu"/.test(menu))
}

/* ---- 4. no iOS zoom on focus ---- */
console.log('\nRule 4 - form controls are >= 16px on mobile')
{
  const bad = []
  for (const f of files) {
    const lines = read(f).split('\n')
    lines.forEach((line, i) => {
      if (!/<(input|select|textarea)\b/.test(line)) return
      if (/\btype="(hidden|checkbox|radio|range|color)"\b/.test(line)) return
      // A sub-16px utility that is not overridden upward on small screens.
      if (/\btext-(xs|sm)\b/.test(line) && !/\btext-base\b/.test(line)) {
        bad.push(`${rel(f)}:${i + 1}`)
      }
    })
  }
  check('no input renders below 16px on mobile', bad.length === 0, bad.join(', '))
}

/* ---- 5. safe areas ---- */
console.log('\nRule 5 - safe areas')
check('viewport-fit=cover is set', /viewport-fit=cover/.test(html))
check('pb-safe utility exists', /\.pb-safe/.test(bare))
check('drawer footer respects the safe area', /pb-safe/.test(menu))

/* ---- 6. no sideways pan ---- */
console.log('\nRule 6 - the page cannot pan sideways')
{
  for (const [name, re] of [
    ['html', /\bhtml\s*\{([^}]*)\}/],
    ['body', /\bbody\s*\{([^}]*)\}/],
  ]) {
    const m = bare.match(re)
    const decls = m ? [...m[1].matchAll(/overflow-x:\s*([^;]+);/g)].map((x) => x[1].trim()) : []
    const last = decls[decls.length - 1]
    check(`${name} overflow-x resolves to clip`, last === 'clip', 'declares: ' + decls.join(' then '))
  }
  check('viewport width is device-width', /width=device-width/.test(html))
}

console.log(
  failed === 0
    ? '\nPASS - mobile UX contract holds'
    : '\nFAIL - ' + failed + ' check(s)'
)
process.exit(failed ? 1 : 0)
