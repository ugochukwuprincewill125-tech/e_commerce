import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, ShoppingBag, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const ToastContext = createContext(null)

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />,
  error: <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />,
  info: <Info className="h-5 w-5 text-brand-500" aria-hidden />,
  cart: <ShoppingBag className="h-5 w-5 text-brand-500" aria-hidden />,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (input) => {
      const t = typeof input === 'string' ? { title: input } : input
      const id = ++idRef.current
      setToasts((list) => [...list.slice(-3), { type: 'success', duration: 4000, ...t, id }])
      window.setTimeout(() => dismiss(id), t.duration ?? 4000)
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      toast,
      success: (title, message) => toast({ type: 'success', title, message }),
      error: (title, message) => toast({ type: 'error', title, message, duration: 5500 }),
      info: (title, message) => toast({ type: 'info', title, message }),
      dismiss,
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-white p-3.5 pr-10 shadow-overlay"
            >
              {t.image ? (
                <img src={t.image} alt="" className="h-12 w-12 flex-none rounded-xl bg-metal-50 object-cover" />
              ) : (
                <span className="mt-0.5 flex-none">{ICONS[t.type] || ICONS.info}</span>
              )}
              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold text-ink-900">{t.title}</p>}
                {t.message && <p className="mt-0.5 text-sm text-metal-500">{t.message}</p>}
                {t.action && (
                  <Link
                    to={t.action.to}
                    onClick={() => dismiss(t.id)}
                    className="mt-1.5 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    {t.action.label} →
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="absolute right-2.5 top-2.5 rounded-lg p-1 text-metal-400 hover:bg-metal-100 hover:text-ink-900"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
