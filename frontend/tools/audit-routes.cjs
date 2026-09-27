/**
 * Audits internal navigation against the routes declared in App.jsx.
 * Run: node tools/audit-routes.cjs
 *
 * - Only scans .jsx (services/*.js hold HTTP endpoints, not navigation).
 * - Dynamic template targets (`/products/${slug}`) are resolved as prefixes.
 * - Query strings and hash fragments are stripped before matching.
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src')
const read = (p) => fs.readFileSync(p, 'utf8')
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsx')) out.push(p)
  }
  return out
}
const app = read(path.join(SRC, 'App.jsx'))

// --- Route table --------------------------------------------------------
// The only nested <Route> group in this app hangs off /account, so children
// are resolved against that parent.
const NESTED_PARENT = '/account'
const routes = new Set()

for (const m of app.matchAll(/<Route\s+path="([^"]*)"/g)) {
  const p = m[1]
  // Relative paths are children of the /account group and are resolved below.
  if (p.startsWith('/')) routes.add(p)
}
// Children of the /account group.
const accountBlock = app.slice(app.indexOf(`path="${NESTED_PARENT}"`))
for (const m of accountBlock.matchAll(/<Route\s+(?:index|path="([^"]*)")[^>]*?\/>/g)) {
  if (m[1]) routes.add(`${NESTED_PARENT}/${m[1]}`)
  else routes.add(NESTED_PARENT)
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const routeList = [...routes]
const exact = routeList.map((p) => {
  const segs = p.split('/').filter(Boolean)
  return new RegExp('^/' + segs.map((s) => (s.startsWith(':') ? '[^/]+' : escape(s))).join('/') + '/?$')
})

/** Strip query + hash. */
const clean = (t) => t.split('?')[0].split('#')[0]

/** Static target must match a route exactly. */
function resolvesExact(target) {
  const c = clean(target)
  if (c === '' || c === '/') return true
  return exact.some((re) => re.test(c))
}

/** Dynamic prefix (`/products/`) must sit at the start of some route. */
function resolvesPrefix(prefix) {
  const c = clean(prefix).replace(/\/+$/, '')
  if (c === '') return true
  return routeList.some((r) => clean(r) === c || clean(r).startsWith(c + '/'))
}

// --- Collect ------------------------------------------------------------
const findings = []
for (const f of walk(SRC)) {
  if (f.endsWith('App.jsx')) continue
  const src = read(f)
  const rel = path.relative(SRC, f)

  for (const re of [/\bto="(\/[^"]*)"/g, /\bto='(\/[^']*)'/g, /\bhref="(\/[^"]*)"/g, /navigate\('(\/[^']*)'/g]) {
    for (const m of src.matchAll(re)) findings.push({ file: rel, target: m[1], dynamic: false })
  }
  for (const re of [/to=\{`(\/[^`]*?)\$\{/g, /navigate\(`(\/[^`]*?)\$\{/g, /`(\/[^`]*?)\$\{/g]) {
    for (const m of src.matchAll(re)) findings.push({ file: rel, target: m[1], dynamic: true })
  }
  for (const m of src.matchAll(/\?\s*'(\/[^']*)'\s*:\s*'(\/[^']*)'/g)) {
    findings.push({ file: rel, target: m[1], dynamic: false })
    findings.push({ file: rel, target: m[2], dynamic: false })
  }
}

const broken = findings.filter((f) => (f.dynamic ? !resolvesPrefix(f.target) : !resolvesExact(f.target)))
const uniq = [...new Set(findings.map((f) => f.target))].sort()

console.log('ROUTES (' + routeList.length + '):')
routeList.sort().forEach((r) => console.log('   ' + r))
console.log('\nSCANNED: ' + findings.length + ' link references across .jsx, ' + uniq.length + ' unique targets')
if (broken.length === 0) {
  console.log('\nPASS - every internal link resolves to a declared route')
} else {
  console.log('\nFAIL - ' + broken.length + ' unresolved:')
  broken.forEach((b) => console.log('   ' + b.file + '  ->  ' + b.target + (b.dynamic ? '  [dynamic prefix]' : '')))
}
process.exit(broken.length ? 1 : 0)
