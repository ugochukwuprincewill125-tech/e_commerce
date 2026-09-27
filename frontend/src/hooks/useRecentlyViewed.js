import { useCallback, useState } from 'react'

const KEY = 'tgs_recently_viewed'
const MAX = 12

function read() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Keeps a small list of product slugs the visitor opened (per browser only). */
export default function useRecentlyViewed() {
  const [slugs, setSlugs] = useState(read)

  const track = useCallback((slug) => {
    if (!slug) return
    const next = [slug, ...read().filter((s) => s !== slug)].slice(0, MAX)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
    setSlugs(next)
  }, [])

  return { slugs, track }
}
