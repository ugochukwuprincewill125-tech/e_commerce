import { motion } from 'framer-motion'
import { Check, CircleX, ClipboardList, CreditCard, PackageCheck, Settings2, Truck, House } from 'lucide-react'

import { cn, formatDateTime } from '../../utils/format'

const ICONS = {
  placed: ClipboardList,
  payment_confirmed: CreditCard,
  processing: Settings2,
  ready_for_delivery: PackageCheck,
  shipped: Truck,
  delivered: House,
}

/** Animated vertical (mobile) / horizontal (desktop) order progress. */
export default function OrderTimeline({ steps = [], cancelled = false }) {
  if (cancelled) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
        <CircleX className="h-5 w-5 flex-none" />
        This order was cancelled. Any reserved items have been returned to stock.
      </div>
    )
  }
  const completed = steps.filter((s) => s.completed).length
  const progress = steps.length > 1 ? ((completed - 1) / (steps.length - 1)) * 100 : 0

  return (
    <div>
      {/* Desktop — horizontal */}
      <ol className="relative hidden grid-cols-6 md:grid" aria-label="Order progress">
        <div className="absolute left-[8.33%] right-[8.33%] top-5 h-1 rounded-full bg-metal-100" aria-hidden>
          <motion.div className="h-full rounded-full bg-brand-500" initial={{ width: 0 }} animate={{ width: `${Math.max(0, progress)}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        {steps.map((step, i) => {
          const Icon = ICONS[step.key] || Check
          return (
            <li key={step.key} className="relative flex flex-col items-center text-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.12 * i, type: 'spring', stiffness: 300, damping: 18 }}
                className={cn(
                  'relative z-10 flex h-11 w-11 items-center justify-center rounded-full ring-4 ring-white',
                  step.completed ? 'bg-brand-500 text-white' : 'bg-metal-100 text-metal-400',
                  step.current && 'ring-2 ring-brand-600',
                )}
              >
                {step.completed && !step.current ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                {step.current && <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />}
              </motion.span>
              <span className={cn('mt-3 text-xs font-semibold', step.completed ? 'text-ink-900' : 'text-metal-400')}>{step.label}</span>
              {step.timestamp && <span className="mt-0.5 text-[11px] text-metal-400">{formatDateTime(step.timestamp)}</span>}
            </li>
          )
        })}
      </ol>

      {/* Mobile — vertical */}
      <ol className="relative space-y-5 md:hidden" aria-label="Order progress">
        <div className="absolute bottom-3 left-5 top-3 w-0.5 bg-metal-100" aria-hidden>
          <motion.div className="w-full bg-brand-500" initial={{ height: 0 }} animate={{ height: `${Math.max(0, progress)}%` }} transition={{ duration: 1.1 }} />
        </div>
        {steps.map((step, i) => {
          const Icon = ICONS[step.key] || Check
          return (
            <motion.li key={step.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }} className="relative flex items-center gap-4">
              <span className={cn('relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full ring-4 ring-white', step.completed ? 'bg-brand-500 text-white' : 'bg-metal-100 text-metal-400')}>
                {step.completed && !step.current ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span>
                <span className={cn('block text-sm font-semibold', step.completed ? 'text-ink-900' : 'text-metal-400')}>
                  {step.label}
                  {step.current && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-600">Current</span>}
                </span>
                {step.timestamp && <span className="text-xs text-metal-400">{formatDateTime(step.timestamp)}</span>}
              </span>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
