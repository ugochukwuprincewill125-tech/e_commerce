import { useAuth } from '../context/AuthContext'
import { ACCOUNT_HOME } from '../utils/navigation'

/**
 * The site "home" for the current session.
 *
 * The storefront landing page is guest-only, so a signed-in member's home is
 * the account "Home" tab — their feed of recently added products. Every "home"
 * affordance (logo, breadcrumb root, 404 back-link) resolves through here so
 * the rule can never drift between components or leave a redirect behind.
 */
export default function useHomeLink() {
  const { user } = useAuth()
  return user ? ACCOUNT_HOME : '/'
}
