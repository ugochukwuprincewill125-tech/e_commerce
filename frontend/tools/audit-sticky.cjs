/**
 * Every sidebar / secondary column must stay put while the page scrolls.
 * Run: node tools/audit-sticky.cjs
 *
 * The requirement: a sidebar never scrolls with the page, but scrolling *inside*
 * a sidebar still works. That needs four things, each checked below.
 *
 *  1. The document must not be a scroll container. `overflow-x: hidden` on
 *     <html>/<body> forces the paired `overflow-y: visible` to compute to
 *     `auto`, which turns them into scroll containers — sticky then resolves
 *     against the wrong scrollport and sidebars drift. `clip` is required.
 *  2. A shared `.pinned-panel` utility must exist, be desktop-scoped, and set
 *     sticky + align-self + a viewport max-height.
 *  3. That panel must be its own scrollport with `overscroll-behavior: contain`
 *     so a wheel gesture inside it stops instead of chaining to the document.
 *  4. No ad-hoc sticky sidebar may remain: every one must use the utility, so
 *     the behaviour is identical everywhere.
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src')
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

const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const bare = stripComments(css)

/* ---- 1. the document must not be a scroll container ---- */
console.log('Rule 1 - document is not a scroll container')
{
  // The effective value is the last declaration, so `clip` must come after the
  // `hidden` fallback.
  const html = bare.match(/\bhtml\s*\{([^}]*)\}/)
  const body = bare.match(/\bbody\s*\{([^}]*)\}/)
  for (const [name, m] of [
    ['html', html],
    ['body', body],
  ]) {
    if (!m) {
      check(`${name} has an overflow-x rule`, false, 'no rule found')
      continue
    }
    const decls = [...m[1].matchAll(/overflow-x:\s*([^;]+);/g)].map((x) => x[1].trim())
    const last = decls[decls.length - 1]
    check(`${name} overflow-x resolves to clip`, last === 'clip', `declares: ${decls.join(' then ')}`)
  }
  check('overscroll containment helper is available', /overscroll-behavior:\s*contain/.test(bare))
}

/* ---- 2. the shared pinned-panel utility ---- */
console.log('\nRule 2 - shared .pinned-panel utility')
{
  const mq = css.match(/@media\s*\(min-width:\s*1024px\)\s*\{([\s\S]*?)\n\}/)
  check('defined inside a desktop-only media query', !!mq)
  const block = mq ? mq[1] : ''
  check('position: sticky', /position:\s*sticky/.test(block))
  check('align-self: start (grid child must not stretch)', /align-self:\s*start/.test(block))
  check('max-height caps it to the viewport', /max-height:\s*calc\(100svh/.test(block))
  check('is its own scrollport', /overflow-y:\s*auto/.test(block))
  check('scroll gesture does not chain to the page', /overscroll-behavior:\s*contain/.test(block))
  check('offset follows the real chrome', /top:\s*var\(--chrome-top/.test(block))
  check('flush variant exists for the full-height rail', /\.pinned-panel-flush/.test(block))
}

/* ---- 3. every sidebar/column uses the utility ---- */
console.log('\nRule 3 - sidebars use the utility, not ad-hoc sticky')
{
  const files = walk(SRC)
  let pinned = 0
  const adHoc = []
  for (const f of files) {
    const r = rel(f)
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!/className=/.test(line)) return
      if (/\bpinned-panel\b/.test(line)) pinned++
      // The old hand-rolled pattern: a column doing its own sticky offset.
      if (/\bsticky\b/.test(line) && /self-start/.test(line) && !/pinned-panel/.test(line)) {
        adHoc.push(`${r}:${i + 1}  ${line.trim().slice(0, 70)}`)
      }
      if (/\bsticky-chrome\b/.test(line)) {
        adHoc.push(`${r}:${i + 1}  uses sticky-chrome instead of pinned-panel`)
      }
    })
  }
  check(`${pinned} sidebar/column(s) use .pinned-panel`, pinned >= 5, `found ${pinned}`)
  check('no ad-hoc sticky sidebar remains', adHoc.length === 0, adHoc.join(' | ').slice(0, 120))
}

/* ---- 4. the specific sidebars the user named ---- */
console.log('\nRule 4 - the sidebars that must be pinned')
{
  const rail = fs.readFileSync(path.join(SRC, 'components', 'Account', 'AccountNav.jsx'), 'utf8')
  check('account rail (home, dashboard, cart, shop, ...) is pinned', /<aside[^>]*pinned-panel/.test(rail))
  check('account rail scrolls internally, not with the page', /overflow-y-auto[^"]*overscroll-contain|overscroll-contain[^"]*overflow-y-auto/.test(rail))

  const shop = fs.readFileSync(path.join(SRC, 'pages', 'Shop', 'Shop.jsx'), 'utf8')
  check('shop filter sidebar is pinned', /<aside[^>]*pinned-panel/.test(shop))
  check('shop filter sidebar is not viewport-height capped twice', !/max-h-\[calc\(100svh/.test(shop))

  const targets = [
    ['components/Account/AccountNav.jsx', 'account rail'],
    ['pages/Shop/Shop.jsx', 'shop filters'],
    ['pages/Cart/Cart.jsx', 'cart summary'],
    ['pages/Checkout/Checkout.jsx', 'checkout summary'],
    ['pages/Contact/Contact.jsx', 'contact form'],
    ['pages/ProductDetails/Gallery.jsx', 'product gallery'],
  ]
  for (const [f, label] of targets) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8')
    check(`${label} uses .pinned-panel`, /pinned-panel/.test(src), f)
  }

  // The mobile buy bar is the one fixed-bottom element left. With no tab bar
  // it must be flush, and the page must reserve its own room for it.
  const pdp = fs.readFileSync(path.join(SRC, 'pages', 'ProductDetails', 'ProductDetails.jsx'), 'utf8')
  check('mobile buy bar is flush (no dead bottom gap)', /fixed inset-x-0 bottom-0/.test(pdp), 'expected no bottom-16 offset')
  check('product page reserves room for the buy bar', /container py-6 pb-24/.test(pdp) && /sm:pb-0/.test(pdp))
  check('buy bar no longer branches on the session', !/bottom-16/.test(pdp))
}

/* ---- 5. chrome offset plumbing ---- */
console.log('\nRule 5 - chrome offset plumbing')
{
  check('--chrome-top is declared', /--chrome-top:\s*0px/.test(css))
  const layout = fs.readFileSync(path.join(SRC, 'components', 'Layout', 'Layout.jsx'), 'utf8')
  check('Layout drives it from navbar visibility', /'--chrome-top':\s*showNavbar\s*\?\s*'68px'\s*:\s*'0px'/.test(layout))
  const shop = fs.readFileSync(path.join(SRC, 'pages', 'Shop', 'Shop.jsx'), 'utf8')
  check('shop filters clear the site navbar', /pinned-panel/.test(shop))
}

console.log(
  failed === 0
    ? '\nPASS - every sidebar is pinned and scrolls only internally'
    : '\nFAIL - ' + failed + ' check(s)'
)
process.exit(failed ? 1 : 0)
