import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Shell for every authentication screen.
 *
 * Deliberately minimal: the form alone. No navbar, no marketing panel, no site
 * footer — an auth screen should do one job. A single "Back to store" link
 * keeps the page from becoming a dead end without reintroducing site chrome.
 *
 * Colour comes from three flat, solid zones rather than decoration or
 * gradients: a soft neutral canvas, an ink header block that carries the
 * title, and a tinted action footer for the cross-links.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-metal-50 px-4 py-12 lg:py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-[27rem]"
      >
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-overlay">
          {/* Ink header block — solid, no gradient */}
          <div className="bg-ink-950 px-7 py-7">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-metal-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Back to store
            </Link>
            <div className="mt-4 flex items-center gap-2.5">
              <span className="block h-2.5 w-2.5 flex-none bg-brand-500" aria-hidden />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-metal-400">
                Timeline Global Systems
              </p>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-metal-400">{subtitle}</p>}
          </div>

          {/* Form body */}
          <div className="px-7 py-7">{children}</div>

          {/* Tinted action footer */}
          {footer && (
            <div className="border-t border-line bg-brand-50 px-7 py-4 text-center text-sm text-metal-600">
              {footer}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-metal-500">Computer Village, Ikeja, Lagos</p>
        </div>
      </motion.div>
    </div>
  )
}
