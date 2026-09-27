/**
 * Finds headings that inherit their colour on a dark surface.
 *
 * `index.css` sets `h1..h4 { color: ink-900 }` on the element itself, which
 * beats an inherited `text-white` from a parent. So any heading inside a dark
 * container that does not declare its own colour renders near-black on a
 * near-black plate.
 *
 * Run: node tools/audit-heading-contrast.cjs
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

// Surfaces dark enough that ink-900 text is unreadable.
const DARK = /(bg-ink-9\d\d|bg-ink-950|bg-brand-700|bg-brand-800|bg-brand-900)\b/
const EXPLICIT_COLOUR = /\btext-(white|ink-\d+|metal-\d+|brand-\d+|danger|success|warning|amber-\d+|emerald-\d+|red-\d+)\b/
// Elements that paint a dark backdrop but do not establish a text surface.
const BACKDROP = /(absolute inset-0|bg-ink-\d+\/\d+|bg-brand-\d+\/\d+)/
// A dark badge/icon is not a text surface.
const NOT_A_CONTAINER = /<(span|svg|img|i)\b/

const suspects = []
for (const f of walk(SRC)) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/')
  const lines = fs.readFileSync(f, 'utf8').split('\n')

  lines.forEach((line, i) => {
    // Matches both <h1 and <motion.h1.
    const m = line.match(/<(?:[a-z]+\.)?(h[1-6])\b/)
    if (!m) return
    // Collect the whole opening tag (headings can wrap across lines).
    let tag = line
    let j = i
    while (!tag.includes('>') && j + 1 < lines.length) {
      j++
      tag += ' ' + lines[j]
    }
    if (EXPLICIT_COLOUR.test(tag)) return

    // Walk upwards for the nearest enclosing dark surface. Only accept a line
    // that opens a real container, is not a translucent overlay backdrop, and
    // is not an icon badge. A container that has already closed between the
    // candidate and the heading is not an ancestor, so the walk stops.
    let found = null
    for (let k = i; k >= Math.max(0, i - 60); k--) {
      const l = lines[k]
      // A closing tag for a container that opened above us ends the subtree.
      const closes = l.match(/<\/(section|article|aside|header|footer|main)>/)
      if (closes) break
      if (!DARK.test(l)) continue
      if (BACKDROP.test(l)) continue
      if (NOT_A_CONTAINER.test(l)) continue
      found = { line: k + 1, text: l.trim() }
      break
    }
    if (found) suspects.push({ rel, line: i + 1, tag: m[1], surface: found })
  })
}

console.log('HEADING CONTRAST AUDIT — ' + walk(SRC).length + ' files\n')
if (!suspects.length) {
  console.log('  PASS — every heading on a dark surface declares its own colour')
} else {
  console.log('  ' + suspects.length + ' heading(s) relying on inherited colour over a dark surface:\n')
  for (const s of suspects) {
    console.log('   ' + s.rel + ':' + s.line + '  <' + s.tag + '>')
    console.log('        dark surface at line ' + s.surface.line + ': ' + s.surface.text.slice(0, 88))
  }
}
process.exit(suspects.length ? 1 : 0)
