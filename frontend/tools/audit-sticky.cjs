/**
 * Every sidebar / sticky column must stay put while its page scrolls.
 * Run: node tools/audit-sticky.cjs
 *
 * Two rules are enforced:
 *  1. Any element using `sticky` must be able to travel. On a grid or flex
 *     child the default `align-self: stretch` makes the element fill the row,
 *     leaving no room to move — so sticky children need `self-start`.
 *  2. Sticky offsets must use the `sticky-chrome` helper (which reads
 *     --chrome-top) rather than a hard-coded pixel value, because the account
 *     shell renders no navbar and would otherwise leave a large dead gap.
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src')
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
const stickies = []
for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/')
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (/\bsticky\b/.test(line) && /className=/.test(line)) stickies.push({ rel, line: i + 1, text: line })
  })
}

console.log('STICKY ELEMENTS FOUND: ' + stickies.length + '\n')
console.log('Rule 1 — sticky grid/flex children can travel')
for (const s of stickies) {
  // A sticky element is a grid/flex child if it sits inside a grid/flex parent.
  // Those must opt out of the stretching default. Elements that are sticky
  // purely inside a scroll container (top-0 headers) are unaffected.
  const needsSelfStart = /lg:sticky|sticky-chrome/.test(s.text) && /top-0/.test(s.text) === false
  if (!needsSelfStart) {
    check(s.rel + ':' + s.line + ' (pinned at top-0, no travel needed)', true)
    continue
  }
  check(s.rel + ':' + s.line + ' has self-start', /self-start/.test(s.text), s.text.trim().slice(0, 70))
}

console.log('\nRule 2 — no hard-coded non-zero sticky offsets')
for (const s of stickies) {
  // `sticky top-0` is correct for a bar pinned to the viewport top and must be
  // exempt. Only a non-zero offset is a hard-coded assumption.
  const hardCoded = /\bsticky\b[^\n]*\btop-(?!0\b)\d/.test(s.text) && !/sticky-chrome/.test(s.text)
  check(s.rel + ':' + s.line + ' uses sticky-chrome', !hardCoded, hardCoded ? s.text.trim().slice(0, 70) : '')
}

console.log('\nRule 3 — the offset variable is driven by real chrome')
const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
const layout = fs.readFileSync(path.join(SRC, 'components', 'Layout', 'Layout.jsx'), 'utf8')
check('--chrome-top is declared', /--chrome-top:\s*0px/.test(css))
check('sticky-chrome utility exists', /\.sticky-chrome/.test(css))
check('Layout sets it from navbar visibility', /'--chrome-top': showNavbar \? '68px' : '0px'/.test(layout))
check('html overflow-x is clipped', /html[\s\S]*?overflow-x:\s*hidden/.test(css.split('body')[0]))
check('body overscroll is handled', /overscroll-behavior-y/.test(css))

console.log('\nRule 4 — mobile sticky bars clear the tab bar')
const pdp = fs.readFileSync(path.join(SRC, 'pages', 'ProductDetails', 'ProductDetails.jsx'), 'utf8')
check('PDP buy bar is auth-aware', /user \? 'bottom-0' : 'bottom-16'/.test(pdp))
check('PDP buy bar reads the session', /const \{ user \} = useAuth\(\)/.test(pdp))

console.log(failed === 0 ? '\nPASS - all sidebars stick correctly' : '\nFAIL - ' + failed + ' check(s)')
process.exit(failed ? 1 : 0)
