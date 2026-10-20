import { useEffect, useRef, useState } from 'react'

const SCRIPT_ID = 'google-identity-services'
let scriptPromise = null

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID)
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', () => reject(new Error('Google Sign-In could not be loaded.')), {
      once: true,
    })
  })
  return scriptPromise
}

/**
 * Official Google Identity Services button.
 *
 * The credential returned by Google is an ID token. It is sent to the backend
 * for signature, audience and expiry validation — the browser never decides
 * who the customer is.
 */
export default function GoogleAuthButton({ onCredential, label = 'Continue with Google' }) {
  const containerRef = useRef(null)
  const callbackRef = useRef(onCredential)
  const [failed, setFailed] = useState(false)
  callbackRef.current = onCredential

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined
    let cancelled = false

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (response) => {
            if (response?.credential) callbackRef.current?.(response.credential)
          },
        })
        const width = Math.min(Math.max(containerRef.current.clientWidth, 220), 400)
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width,
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [clientId])

  if (!clientId) return null

  return (
    <div>
      <div ref={containerRef} className="flex min-h-[44px] w-full justify-center" aria-label={label} />
      {failed && (
        <p className="mt-2 text-center text-xs text-metal-500">
          Google Sign-In is unavailable right now. Please use your email and password.
        </p>
      )}
      <span className="sr-only">{label}</span>
    </div>
  )
}
