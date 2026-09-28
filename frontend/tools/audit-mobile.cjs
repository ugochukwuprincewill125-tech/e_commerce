/**
 * Static mobile-responsiveness audit.
 * Run: node tools/audit-mobile.cjs
 *
 * Flags patterns that commonly break small screens. Each finding is a hint to
 * inspect, not an automatic failure — some are intentional.
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

const findings = []
const add = (file, rule, line, text) => findings.push({ file, rule, line, text: text.trim().slice(0, 96) })

const RULES = [
  // Overflow risks
  ['fixed-width-over-360px', /className="[^"]*\bw-\[(?:3[6-9]\d|[4-9]\d\d|\d{4,})px\]/],
  ['min-width-over-320px', /className="[^"]*\bmin-w-\[(?:3[2-9]\d|[4-9]\d\d|\d{4,})px\]/],
  ['negative-margin-bleed', /className="[^"]*-mx-\d(?![0-9])[^"]*"/],
  // Content hidden on mobile with no fallback
  ['sm-only-content', /className="[^"]*\bsm:(?:block|flex|grid)\b[^"]*"[^>]*>\s*$/],
  // Interaction that only exists on hover
  ['hover-only-reveal', /className="[^"]*\bgroup-hover:(?:opacity-100|translate-y-0|block)\b/],
  // Tables without a mobile fallback
  ['raw-table', /<table\b/],
  // Small tap targets
  ['tiny-tap-target', /className="[^"]*\bh-6\b[^"]*\b(?:flex|items-center)[^"]*"/],
  // Multi-column grid with no small-screen collapse
  ['grid-no-mobile-base', /grid-cols-[3-9]\b(?![^"]*\bsm:grid-cols-1\b)/],
  // Fixed positioning that may need safe-area
  ['fixed-bottom-bar', /className="[^"]*\bfixed\b[^"]*\bbottom-0\b/],
  // Non-wrapping identifiers that can overflow
  ['truncate-missing', /font-mono/],
]

for (const f of walk(SRC)) {
  const src = read(f)
  const rel = path.relative(SRC, f).replace(/\\/g, '/')
  const lines = src.split('\n')
  for (const [rule, re] of RULES) {
    lines.forEach((line, i) => {
      if (re.test(line)) add(rel, rule, i + 1, line)
    })
  }
}

const byRule = new Map()
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, [])
  byRule.get(f.rule).push(f)
}

console.log('MOBILE AUDIT — ' + walk(SRC).length + ' files scanned\n')
for (const [rule, items] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log('  ' + rule.toUpperCase() + '  (' + items.length + ')')
  items.slice(0, 8).forEach((i) => console.log('      ' + i.file + ':' + i.line + '  ' + i.text))
  if (items.length > 8) console.log('      ... +' + (items.length - 8) + ' more')
  console.log('')
}

// Global guards that must exist in the stylesheet.
const css = read(path.join(SRC, 'index.css'))
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
console.log('GLOBAL GUARDS')
const guards = [
  // `clip`, not `hidden`: `overflow-x: hidden` makes html/body scroll
  // containers, which breaks every pinned sidebar. `hidden` is kept only as a
  // fallback declaration, so check the effective (last) value.
  [
    'html/body overflow-x resolves to clip',
    ['html', 'body'].every((sel) => {
      const m = bare.match(new RegExp('\\b' + sel + '\\s*\\{([^}]*)\\}'))
      if (!m) return false
      const decls = [...m[1].matchAll(/overflow-x:\s*([^;]+);/g)].map((d) => d[1].trim())
      return decls[decls.length - 1] === 'clip'
    }),
  ],
  ['viewport meta present', /width=device-width/.test(read(path.join(SRC, '..', 'index.html')))],
  ['viewport-fit=cover for safe areas', /viewport-fit=cover/.test(read(path.join(SRC, '..', 'index.html')))],
  ['tap highlight suppressed', /-webkit-tap-highlight-color/.test(css)],
  ['touch-action / overscroll handled', /overscroll-behavior|touch-action/.test(css)],
]
guards.forEach(([label, ok]) => console.log('  ' + (ok ? 'PASS  ' : 'FAIL  ') + label))
process.exit(guards.some(([, ok]) => !ok) ? 1 : 0)
