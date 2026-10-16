/**
 * Navigation helpers shared by the route guards and the auth screens.
 */

/**
 * Where a signed-in user lands: the "Home" tab of the account shell, which
 * lists the most recently added products across every category. Used as the
 * default `next` target and by the guest-landing guard so the post-auth
 * destination can never drift between call sites.
 */
export const ACCOUNT_HOME = '/account/home'

/**
 * Validate a `?next=` redirect target.
 *
 * Only same-origin absolute paths are allowed. Rejects protocol-relative URLs
 * (`//evil.com`) and backslash variants (`/\evil.com`) — both of which start
 * with `/` and would otherwise send the user to another origin.
 */
export function safeNext(value, fallback = ACCOUNT_HOME) {
  if (typeof value !== 'string') return fallback
  const target = value.trim()
  if (!target.startsWith('/')) return fallback
  // Second character must not be a slash or backslash.
  if (/^\/[\\/]/.test(target)) return fallback
  // Strip control characters that could be used to smuggle a URL.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(target)) return fallback
  return target
}

/** Build a login URL that returns the user to `path` after signing in. */
export function withNext(path) {
  return `/login?next=${encodeURIComponent(path)}`
}

/** The full in-app location, including query and hash, for `next` params. */
export function currentTarget(location) {
  return `${location.pathname}${location.search}${location.hash}`
}

/**
 * Add-to-cart sign-in gate (used on the storefront landing page).
 *
 * A guest who clicks "Add to cart" there must sign in first. The item is held
 * in `sessionStorage`, the gate URL carries `?resume=cart` (which the landing
 * page's guest-only guard honours so the returning user lands back there), and
 * Home completes the add once an authenticated session exists.
 */
export const PENDING_CART_ITEM_KEY = 'tgs:pending-cart-item'
export const CART_RESUME_PARAM = 'resume'
export const CART_RESUME_MARKER = 'cart'
export const CART_RESUME_TARGET = `/?${CART_RESUME_PARAM}=${CART_RESUME_MARKER}`

export function savePendingCartItem(product, variant = null) {
  sessionStorage.setItem(
    PENDING_CART_ITEM_KEY,
    JSON.stringify({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      image: product.image,
      savedAt: Date.now(),
    }),
  )
}

/** Reads and clears the held item. Returns null when missing, stale or corrupt. */
export function takePendingCartItem(maxAgeMs = 15 * 60 * 1000) {
  const raw = sessionStorage.getItem(PENDING_CART_ITEM_KEY)
  if (!raw) return null
  sessionStorage.removeItem(PENDING_CART_ITEM_KEY)
  try {
    const item = JSON.parse(raw)
    if (item?.productId && Date.now() - item.savedAt <= maxAgeMs) return item
  } catch {
    /* fall through */
  }
  return null
}
