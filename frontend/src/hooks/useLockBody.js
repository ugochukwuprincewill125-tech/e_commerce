import { useEffect } from 'react'

/** Prevent background scrolling while a drawer or modal is open. */
export default function useLockBody(locked) {
  useEffect(() => {
    if (!locked) return undefined
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [locked])
}
