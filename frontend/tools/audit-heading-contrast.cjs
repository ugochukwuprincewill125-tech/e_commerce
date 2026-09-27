/**
 * Guards against unreadable headings on dark surfaces.
 *
 * The original bug: index.css set `color` on the h1..h4 element selector,
 * which beats an inherited colour from a dark ancestor. Every heading on a
 * dark plate therefore rendered ink-900 on ink-950 — effectively invisible.
 *
 * Two checks:
 *   1. ROOT CAUSE — the heading element rule must not hardcode a colour.
 *      Colour has to stay inheritable so `text-white` on a dark parent works.
 *   2. REGRESSION — no heading may sit inside a container whose token is too
 *      dark for ink-900 text. The dark set is derived from the real token
 *      values in tailwind.config.js by WCAG contrast, so it cannot drift when
 *      the palette is retuned.
 *
 * Run: node tools/audit-heading-contrast.cjs
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

/* ---------- token helpers ---------- */

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

// WCAG relative luminance.
const luminance = (hex) =>
  hexToRgb(hex)
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0)

const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// Pull the hex values out of the Tailwind `colors` block. Extracts the block
// by brace matching first, so families and flat tokens are both handled and
// nothing outside `colors` leaks in.
function loadTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8')
  const tokens = {}

  const at = css.indexOf('colors:')
  if (at === -1) return tokens
  const open = css.indexOf('{', at)
  if (open === -1) return tokens

  let depth = 0
  let end = open
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const block = css.slice(open + 1, end)

  // Families: `ink: { 950: '#05080F', ... }`
  for (const m of block.matchAll(/(\w[\w-]*)\s*:\s*\{([^{}]*)\}/g)) {
    for (const s of m[2].matchAll(/(\d+|DEFAULT)\s*:\s*'(#[0-9A-Fa-f]{3,8})'/g)) {
      tokens[`${m[1]}-${s[1]}`] = s[2]
    }
  }
  // Flat tokens: `success: '#0E9F6E'`. The key must start with a letter, so
  // numeric shade keys inside a family (`950: '#05080F'`) are not re-matched
  // here as bogus top-level tokens.
  for (const m of block.matchAll(/([A-Za-z]\w*)\s*:\s*'(#[0-9A-Fa-f]{3,8})'/g)) {
    tokens[m[1]] = m[2]
  }
  return tokens
}

const INK = '#0A0F1C' // the default body text colour
// A real colour declaration. `text-wrap`, `text-balance` etc. are not colours,
// so match the palette families explicitly rather than a bare `text-`.
const COLOUR_DECL = /\btext-(?:ink|metal|brand|line)-\d+\b|\btext-white\b|\btext-(?:success|danger|warning)\b/

/* ---------- check 1: root cause ---------- */

function checkRootCause() {
  const raw = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
  // Strip comments first: prose mentioning `text-white` must not count as a
  // declaration, or the explanatory comment above the rule trips the check.
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  const problems = []

  // The h1..h4 element rule must not declare a colour.
  const rule = css.match(/(^|\n)\s*h1,\s*\n\s*h2,\s*\n\s*h3,\s*\n\s*h4\s*\{([^}]*)\}/)
  if (rule && COLOUR_DECL.test(rule[2])) {
    problems.push('index.css: the h1..h4 element rule sets a colour, which overrides inherited dark-surface colours')
  }
  // Guard against the pattern returning under a different selector list.
  for (const r of css.match(/(^|\n)\s*h[1-6][^{]*\{([^}]*)\}/g) || []) {
    if (COLOUR_DECL.test(r)) {
      problems.push(`index.css: heading selector hardcodes a colour -> ${r.trim().slice(0, 60)}`)
    }
  }
  // body must still establish the default colour for light surfaces.
  if (!/\bbody\s*\{[^}]*text-ink-900/s.test(css)) {
    problems.push('index.css: <body> must set text-ink-900 so headings inherit a default on light surfaces')
  }
  return problems
}

/* ---------- check 2: regression ---------- */

function checkHeadings(darkTokens) {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.name.endsWith('.jsx')) out.push(p)
    }
    return out
  }
  const files = walk(SRC)

  const DARK = new RegExp(`\\b(?:${[...darkTokens.keys()].join('|')})\\b`)
  const EXPLICIT = /\btext-(white|ink-\d+|metal-\d+|brand-\d+|success|danger|warning)\b/
  const BACKDROP = /(absolute inset-0|\/\d+\b)/ // translucent overlay
  const NOT_CONTAINER = /<(span|svg|img|i)\b/

  const suspects = []
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const m = line.match(/<(?:[a-z]+\.)?(h[1-6])\b/)
      if (!m) return
      // Headings can wrap; gather the whole opening tag.
      let tag = line
      let j = i
      while (!tag.includes('>') && j + 1 < lines.length) tag += ' ' + lines[++j]
      if (EXPLICIT.test(tag)) return

      // Walk up to the nearest *enclosing* dark container.
      for (let k = i; k >= Math.max(0, i - 60); k--) {
        const l = lines[k]
        if (/<\/(section|article|aside|header|footer|main|div)>/.test(l)) break
        if (!DARK.test(l) || BACKDROP.test(l) || NOT_CONTAINER.test(l)) continue
        suspects.push({ file: rel(f), line: i + 1, tag: m[1], surface: l.trim().slice(0, 84) })
        break
      }
    })
  }
  return { suspects, count: files.length }
}

/* ---------- run ---------- */

const tokens = loadTokens()
const darkTokens = new Map()
for (const [name, hex] of Object.entries(tokens)) {
  if (!/^#[0-9A-Fa-f]{3,8}$/.test(hex)) continue
  // Too dark for ink-900 body text => headings must declare their own colour.
  if (contrast(INK, hex) < 4.5) darkTokens.set('bg-' + name, hex)
}

const root = checkRootCause()
const { suspects, count } = checkHeadings(darkTokens)

console.log(`HEADING CONTRAST AUDIT — ${count} files`)
console.log(
  `  derived ${darkTokens.size} dark surface token(s) from tailwind.config.js: ` +
    [...darkTokens.keys()].join(', ')
)
console.log('')

if (!root.length && !suspects.length) {
  console.log('  PASS — heading colour is inheritable, and every heading on a dark surface declares its own')
  process.exit(0)
}
if (root.length) {
  console.log('  ROOT CAUSE:')
  root.forEach((p) => console.log('   - ' + p))
  console.log('')
}
if (suspects.length) {
  console.log(`  ${suspects.length} heading(s) relying on inherited colour over a dark surface:`)
  suspects.forEach((s) => {
    console.log(`   ${s.file}:${s.line}  <${s.tag}>`)
    console.log(`        ${s.surface}`)
  })
}
process.exit(1)
