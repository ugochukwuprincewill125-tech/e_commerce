import { useCallback, useState } from 'react'

const KEY = 'tgs_checkout_prefs'
const DEFAULTS = { coupon_code: '', state: '', delivery_method: 'delivery' }

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.sessionStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

/** Remembers coupon / state / delivery choice between the cart and checkout pages (this tab only). */
export default function useCheckoutPrefs() {
  const [prefs, setPrefs] = useState(read)
  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  const reset = useCallback(() => {
    try {
      window.sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setPrefs(DEFAULTS)
  }, [])
  return [prefs, update, reset]
}
