/**
 * Navigation helpers shared by the route guards and the auth screens.
 */

/**
 * Validate a `?next=` redirect target.
 *
 * Only same-origin absolute paths are allowed. Rejects protocol-relative URLs
 * (`//evil.com`) and backslash variants (`/\evil.com`) — both of which start
 * with `/` and would otherwise send the user to another origin.
 */
export function safeNext(value, fallback = '/account') {
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
