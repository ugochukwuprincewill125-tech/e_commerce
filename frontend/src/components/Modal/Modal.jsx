import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import useLockBody from '../../hooks/useLockBody'
import { cn } from '../../utils/format'

/** Accessible modal: Esc to close, focus moved inside, background scroll locked. */
export default function Modal({ open, onClose, title, children, className, size = 'max-w-lg', hideTitle = false }) {
  const panel = useRef(null)
  useLockBody(open)

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => panel.current?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      previous?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-ink-950/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cn('relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-lift outline-none sm:rounded-lg', size, className)}
          >
            {!hideTitle && title && (
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-20 rounded-full bg-white/90 p-2 text-ink-900 shadow-sm transition hover:rotate-90 hover:bg-metal-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
