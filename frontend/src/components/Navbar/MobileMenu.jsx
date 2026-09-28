import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, LogOut, Package, User, X } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import useLockBody from '../../hooks/useLockBody'
import { catalogService } from '../../services/productService'
import { categoryIcon } from '../../utils/icons'
import { cn } from '../../utils/format'
import InstagramIcon from '../Icons/InstagramIcon'
import Logo from '../Logo/Logo'

export default function MobileMenu({ open, onClose, sections = [] }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  useLockBody(open)

  // Navigating from inside the drawer must dismiss it.
  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'root'],
    queryFn: () => catalogService.categories({ root: true }),
    staleTime: 600_000,
    enabled: open,
  })

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <motion.div className="absolute inset-0 bg-ink-950/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Logo size="sm" />
              <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-metal-100" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
              <nav aria-label="Mobile">
                {sections.map((section, s) => (
                  <div key={section.title || 'primary'} className={s > 0 ? 'mt-6' : ''}>
                    {section.title && (
                      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-metal-400">{section.title}</p>
                    )}
                    {section.links.map((link, i) => (
                      <motion.div
                        key={link.to}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.03 * (s * 8 + i) }}
                      >
                        <NavLink
                          to={link.to}
                          end={link.end}
                          className={({ isActive }) => cn('flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold', isActive ? 'bg-metal-50 text-ink-900' : 'text-ink-800')}
                        >
                          {link.label}
                          <ChevronRight className="h-4 w-4 flex-none text-metal-300" />
                        </NavLink>
                      </motion.div>
                    ))}
                  </div>
                ))}
              </nav>

              <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-metal-400">Shop by category</p>
              <div className="mt-2 grid grid-cols-2 gap-2 px-1">
                {categories.slice(0, 12).map((c) => {
                  const Icon = categoryIcon(c.icon)
                  return (
                    <NavLink key={c.slug} to={`/category/${c.slug}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs font-medium">
                      <Icon className="h-4 w-4 flex-none text-brand-500" />
                      <span className="truncate">{c.name}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-line p-4 pb-safe">
              {user ? (
                <div className="grid grid-cols-2 gap-2">
                  <NavLink to="/account" className="flex items-center justify-center gap-2 rounded-xl bg-metal-50 py-3 text-sm font-semibold">
                    <User className="h-4 w-4" /> Account
                  </NavLink>
                  <NavLink to="/account/orders" className="flex items-center justify-center gap-2 rounded-xl bg-metal-50 py-3 text-sm font-semibold">
                    <Package className="h-4 w-4" /> Orders
                  </NavLink>
                  <button
                    type="button"
                    onClick={async () => {
                      onClose()
                      navigate('/')
                      await logout()
                    }}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-danger"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <NavLink to="/login" className="btn-outline">
                    Sign in
                  </NavLink>
                  <NavLink to="/register" className="btn-primary">
                    Create account
                  </NavLink>
                </div>
              )}
              <a href="https://www.instagram.com/timelinegadgets/" target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-metal-500">
                <InstagramIcon className="h-4 w-4" /> @timelinegadgets
              </a>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
