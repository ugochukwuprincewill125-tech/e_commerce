/**
 * Navigation configuration shared by the navbar, the mobile drawer, the
 * account sidebar and the search category picker, so the link lists can never
 * drift apart between surfaces.
 */

export const GUEST_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/categories', label: 'Categories' },
  { to: '/brands', label: 'Brands' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

/**
 * Signed-in members have no "Home" link: the storefront landing page is
 * guest-only, and their equivalent destination is the account Home tab, which
 * the account sidebar already provides.
 */
export const MEMBER_LINKS = [
  { to: '/account', label: 'My Account', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/categories', label: 'Categories' },
  { to: '/brands', label: 'Brands' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]
