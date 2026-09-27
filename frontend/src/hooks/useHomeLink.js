import { useAuth } from '../context/AuthContext'

/**
 * The site "home" for the current session.
 *
 * The storefront landing page is guest-only, so a signed-in member's home is
 * their account dashboard. Every "home" affordance (logo, breadcrumb root,
 * 404 back-link) resolves through here so the rule can never drift between
 * components or leave a redirect behind.
 */
export default function useHomeLink() {
  const { user } = useAuth()
  return user ? '/account' : '/'
}
