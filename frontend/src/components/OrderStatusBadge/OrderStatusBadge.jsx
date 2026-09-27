import { cn } from '../../utils/format'

/**
 * Status chips. Solid low-saturation fills with a matching text colour so the
 * badge reads at a glance in dense tables without relying on hue alone — every
 * state also carries its own label text.
 */
const STATUS = {
  placed: 'bg-metal-100 text-metal-600',
  payment_confirmed: 'bg-brand-50 text-brand-700',
  processing: 'bg-violet-50 text-violet-700',
  ready_for_delivery: 'bg-cyan-50 text-cyan-700',
  shipped: 'bg-amber-50 text-amber-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
}
const PAYMENT = {
  pending: 'bg-metal-100 text-metal-600',
  paid: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-amber-50 text-amber-700',
}

export function OrderStatusBadge({ status, label }) {
  return <span className={cn('chip whitespace-nowrap normal-case tracking-normal', STATUS[status] || STATUS.placed)}>{label}</span>
}

export function PaymentStatusBadge({ status, label }) {
  return <span className={cn('chip whitespace-nowrap normal-case tracking-normal', PAYMENT[status] || PAYMENT.pending)}>{label}</span>
}
