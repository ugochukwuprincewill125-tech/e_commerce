import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import Logo from '../../components/Logo/Logo'

/**
 * Shell for every authentication screen.
 *
 * Deliberately minimal: the form alone. No navbar, no marketing panel, no site
 * footer — an auth screen should do one job. A single "Back to store" link
 * keeps the page from becoming a dead end without reintroducing site chrome.
 *
 * The header is the brand red rather than black, with a quiet tonal pattern so
 * the card reads as a designed surface instead of a flat colour block.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-brand-50/70 via-metal-50 to-metal-50 px-4 py-12 lg:py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-[27rem]"
      >
        <div className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-overlay">
          {/* Brand-red header with a restrained tonal pattern. */}
          <div className="relative overflow-hidden bg-brand-700 px-7 pb-7 pt-6">
            <span
              className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border-[22px] border-white/[0.07]"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -bottom-24 left-10 h-32 w-32 rotate-12 rounded-2xl bg-brand-800/50"
              aria-hidden
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <Logo onDark size="sm" />
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/80 transition-colors hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                  Back to store
                </Link>
              </div>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">{title}</h1>
              {subtitle && (
                <p className="mt-2 text-sm leading-relaxed text-white/75">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Form body */}
          <div className="px-7 py-7">{children}</div>

          {/* Tinted action footer */}
          {footer && (
            <div className="border-t border-brand-100 bg-brand-50 px-7 py-4 text-center text-sm text-metal-600">
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
