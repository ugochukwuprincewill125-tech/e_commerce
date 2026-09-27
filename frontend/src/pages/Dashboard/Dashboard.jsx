import { Outlet } from 'react-router-dom'

import AccountShell from '../../components/Account/AccountShell'
import Seo from '../../components/Seo/Seo'

/**
 * Layout route for the account area. The rail and content column live in
 * AccountShell so that every route the sidebar can reach — including the
 * storefront pages — keeps the same shell.
 */
export default function Dashboard() {
  return (
    <>
      <Seo title="My account" noindex />
      <AccountShell>
        <Outlet />
      </AccountShell>
    </>
  )
}
