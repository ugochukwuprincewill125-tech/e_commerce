/**
 * Verifies the redirect hardening in src/utils/navigation.js.
 * Run: node tools/test-navigation.cjs
 */
const path = require('path')
const fs = require('fs')

// Transpile the ESM source to CJS for a quick assertion run.
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'navigation.js'), 'utf8')
const cjs = src
  .replace(/export function /g, 'function ')
  .replace(/export const /g, 'const ')
const mod = { exports: {} }
new Function('module', 'exports', cjs + '\nmodule.exports = { safeNext, withNext, currentTarget }')(mod, mod.exports)
const { safeNext, withNext, currentTarget } = mod.exports

let failed = 0
const is = (label, got, want) => {
  const ok = got === want
  if (!ok) failed++
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + '  ->  ' + JSON.stringify(got) + (ok ? '' : '  (expected ' + JSON.stringify(want) + ')'))
}

console.log('safeNext: legitimate targets are preserved')
is('/account', safeNext('/account'), '/account')
is('/cart', safeNext('/cart'), '/cart')
is('/checkout?step=2', safeNext('/checkout?step=2'), '/checkout?step=2')
is('/contact#locations', safeNext('/contact#locations'), '/contact#locations')

console.log('\nsafeNext: off-origin and malformed targets fall back')
is('protocol-relative //evil.com', safeNext('//evil.com'), '/account')
is('backslash /\\evil.com', safeNext('/\\evil.com'), '/account')
is('absolute https://evil.com', safeNext('https://evil.com'), '/account')
is('absolute http://evil.com', safeNext('http://evil.com'), '/account')
is('javascript: alert(1)', safeNext('javascript:alert(1)'), '/account')
is('empty string', safeNext(''), '/account')
is('null', safeNext(null), '/account')
is('undefined', safeNext(undefined), '/account')
is('number', safeNext(42), '/account')
is('custom fallback', safeNext('//evil.com', '/'), '/')
is('newline smuggling', safeNext('/account\n//evil.com'), '/account')
is('tab smuggling', safeNext('/account\tSet-Cookie'), '/account')

console.log('\nwithNext round-trips through safeNext')
is('withNext(/cart)', withNext('/cart'), '/login?next=%2Fcart')
is('decoded', safeNext(new URLSearchParams(withNext('/account/orders').split('?')[1]).get('next')), '/account/orders')

console.log('\ncurrentTarget includes search and hash')
is('currentTarget', currentTarget({ pathname: '/shop', search: '?q=phone', hash: '#grid' }), '/shop?q=phone#grid')

console.log(failed === 0 ? '\nPASS - all navigation hardening assertions hold' : '\nFAIL - ' + failed + ' assertion(s)')
process.exit(failed ? 1 : 0)
