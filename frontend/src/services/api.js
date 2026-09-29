import axios from 'axios'

// Defaults to the same origin (production deploys serve the API from the
// same Vercel domain); local development sets VITE_API_URL in frontend/.env.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const ACCESS_KEY = 'tgs_access'
const REFRESH_KEY = 'tgs_refresh'
const CART_KEY = 'tgs_cart_session'

/* ---------------------------- token storage ----------------------------- */
function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable (private mode) — keep working in memory */
  }
}

let accessToken = safeGet(ACCESS_KEY)
let refreshToken = safeGet(REFRESH_KEY)

export const tokens = {
  get access() {
    return accessToken
  },
  get refresh() {
    return refreshToken
  },
  set({ access, refresh }) {
    if (access !== undefined) {
      accessToken = access
      safeSet(ACCESS_KEY, access)
    }
    if (refresh !== undefined) {
      refreshToken = refresh
      safeSet(REFRESH_KEY, refresh)
    }
  },
  clear() {
    accessToken = null
    refreshToken = null
    safeSet(ACCESS_KEY, null)
    safeSet(REFRESH_KEY, null)
  },
}

export const cartSession = {
  get: () => safeGet(CART_KEY),
  set: (id) => safeSet(CART_KEY, id),
  clear: () => safeSet(CART_KEY, null),
}

/* ------------------------------ axios setup ----------------------------- */
const api = axios.create({ baseURL: API_URL, timeout: 20000 })

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
  if (!error.response) return 'Unable to reach the server. Check your internet connection.'
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
