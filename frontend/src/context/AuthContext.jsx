import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { tokens } from '../services/api'
import { authService } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(null)
  const [initialising, setInitialising] = useState(Boolean(tokens.access || tokens.refresh))

  // Restore the session on first load.
  useEffect(() => {
    let active = true
    if (!tokens.access && !tokens.refresh) return undefined
    authService
      .me()
      .then((me) => active && setUser(me))
      .catch(() => {
        tokens.clear()
        if (active) setUser(null)
      })
      .finally(() => active && setInitialising(false))
    return () => {
      active = false
    }
  }, [])

  // The API layer fires this when a refresh token is no longer valid.
  useEffect(() => {
    const onForcedLogout = () => {
      setUser(null)
      queryClient.removeQueries({ queryKey: ['orders'] })
      queryClient.removeQueries({ queryKey: ['dashboard'] })
      window.location.href = '/login'
    }
    window.addEventListener('tgs:logout', onForcedLogout)
    return () => window.removeEventListener('tgs:logout', onForcedLogout)
  }, [queryClient])

  const login = useCallback(async (email, password, remember = false) => {
    const me = await authService.login(email, password, remember)
    setUser(me)
    return me
  }, [])

  const register = useCallback(async (payload) => {
    // New accounts are signed out until their email is verified. Do not put
    // `data.user` in the auth context — that would make the guest-only route
    // send them straight to a dashboard they cannot access yet.
    return authService.register(payload)
  }, [])

  const googleLogin = useCallback(async (credential, remember = false) => {
    const me = await authService.googleLogin(credential, remember)
    setUser(me)
    return me
  }, [])

  const logout = useCallback(async ({ remote = true } = {}) => {
    // `remote: false` is for cases where the current token is no longer
    // accepted (for example after changing an email, which un-verifies the
    // account). It clears the local session without provoking a server 401.
    if (remote) await authService.logout().catch(() => {})
    else tokens.clear()
    setUser(null)
    // Drop every cache scoped to the account so the next user (or guest) can
    // never see stale orders, addresses, dashboard totals or wishlist data.
    ;['orders', 'dashboard', 'addresses', 'wishlist'].forEach((key) =>
      queryClient.removeQueries({ queryKey: [key] }),
    )
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    const me = await authService.me()
    setUser(me)
    return me
  }, [])

  const value = useMemo(
    () => ({ user, setUser, isAuthenticated: Boolean(user), initialising, login, googleLogin, register, logout, refreshUser }),
    [user, initialising, login, googleLogin, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
