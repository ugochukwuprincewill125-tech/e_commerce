import axios from 'axios'

// Local development sets VITE_API_URL in frontend/.env. Production builds
// (Vercel) MUST set it too — it points at the Render backend, e.g.
// https://timeline-backend.onrender.com/api. The '/api' fallback only makes
// sense when the API shares this origin.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error(
    '[config] VITE_API_URL is not set: API requests will hit the storefront host instead of the backend. ' +
      'Set VITE_API_URL (e.g. https://<service>.onrender.com/api) in the Vercel project env and redeploy.',
  )
}

const ACCESS_KEY = 'tgs_access'
const REFRESH_KEY = 'tgs_refresh'
const CART_KEY = 'tgs_cart_session'
const REMEMBER_KEY = 'tgs_remember_email'

/* ---------------------------- token storage ----------------------------- */
function safeGet(key, storage = window.localStorage) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key, value, storage = window.localStorage) {
  try {
    if (value) storage.setItem(key, value)
    else storage.removeItem(key)
  } catch {
    /* storage unavailable (private mode) — keep working in memory */
  }
}

function readToken(key) {
  try {
    const persistent = window.localStorage.getItem(key)
    if (persistent !== null) return { value: persistent, remember: true }
    const session = window.sessionStorage.getItem(key)
    if (session !== null) return { value: session, remember: false }
  } catch {
    /* storage unavailable */
  }
  return { value: null, remember: null }
}

const storedAccess = readToken(ACCESS_KEY)
const storedRefresh = readToken(REFRESH_KEY)
let accessToken = storedAccess.value
let refreshToken = storedRefresh.value
// Tokens created before this flag existed are persistent. A session chosen at
// sign-in is preserved across refresh-token rotation because `set` only
// changes the mode when `remember` is explicitly supplied.
let rememberTokens = storedAccess.remember ?? storedRefresh.remember ?? true

function writeToken(key, value) {
  safeSet(key, rememberTokens ? value : null, window.localStorage)
  safeSet(key, rememberTokens ? null : value, window.sessionStorage)
}

export const tokens = {
  get access() {
    return accessToken
  },
  get refresh() {
    return refreshToken
  },
  set({ access, refresh, remember }) {
    if (remember !== undefined) rememberTokens = Boolean(remember)
    if (access !== undefined) {
      accessToken = access
      writeToken(ACCESS_KEY, access)
    }
    if (refresh !== undefined) {
      refreshToken = refresh
      writeToken(REFRESH_KEY, refresh)
    }
  },
  clear() {
    accessToken = null
    refreshToken = null
    safeSet(ACCESS_KEY, null, window.localStorage)
    safeSet(REFRESH_KEY, null, window.localStorage)
    safeSet(ACCESS_KEY, null, window.sessionStorage)
    safeSet(REFRESH_KEY, null, window.sessionStorage)
  },
}

/** The email address remembered on this device (never the password). */
export const rememberedEmail = {
  get() {
    return safeGet(REMEMBER_KEY) || ''
  },
  set(email) {
    safeSet(REMEMBER_KEY, email)
  },
  clear() {
    safeSet(REMEMBER_KEY, null)
  },
}

export const cartSession = {
  get: () => safeGet(CART_KEY),
  set: (id) => safeSet(CART_KEY, id),
  clear: () => safeSet(CART_KEY, null),
}

/* ------------------------------ axios setup ----------------------------- */
// 60s, not 20s: the API runs on a free tier that can take up to about a
// minute to wake after idle. A shorter timeout aborts the request while the
// server is still booting — the browser then reports a network error even
// when the write actually went through. Steady-state responses are fast, so
// this only matters for the first request after a quiet period.
const api = axios.create({ baseURL: API_URL, timeout: 60000 })

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  const session = cartSession.get()
  if (session) config.headers['X-Cart-Session'] = session
  return config
})

let refreshPromise = null

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('No refresh token')
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh/`, { refresh: refreshToken })
      .then(({ data }) => {
        tokens.set({ access: data.access, refresh: data.refresh ?? refreshToken })
        return data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh')
    if (status === 401 && refreshToken && !original._retry && !isAuthCall) {
      original._retry = true
      try {
        const access = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
      } catch {
        tokens.clear()
        window.dispatchEvent(new Event('tgs:logout'))
      }
    } else if (status === 401 && accessToken && !isAuthCall && original?._retry) {
      tokens.clear()
      window.dispatchEvent(new Event('tgs:logout'))
    }
    return Promise.reject(error)
  },
)

/** Turn any API error into a friendly message. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (error.code === 'ECONNABORTED') return 'The request timed out. Check your connection and try again.'
  if (!error.response) return 'Unable to reach the server. If the site has been idle, it may be waking up — wait a moment and try again.'
  return error.response.data?.detail || fallback
}

/** Field errors from DRF for react-hook-form setError. */
export function fieldErrors(error) {
  const errors = error?.response?.data?.errors
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return {}
  return Object.fromEntries(
    Object.entries(errors).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
  )
}

export default api
