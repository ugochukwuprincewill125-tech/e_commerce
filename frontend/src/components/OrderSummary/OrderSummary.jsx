import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LoaderCircle, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn, formatNaira } from '../../utils/format'

function Row({ label, value, tone, strong, hint }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', strong ? 'border-t border-line pt-3.5' : 'py-1')}>
      <span className={cn(strong ? 'text-[15px] font-semibold uppercase tracking-wide text-ink-900' : 'text-[13px] text-metal-500', hint && 'flex flex-col')}>
        {label}
        {hint && <span className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-metal-400">{hint}</span>}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18 }}
          className={cn(
            'flex-none tabular-nums',
            strong ? 'text-xl font-bold text-ink-900' : 'text-[13px] font-semibold text-ink-900',
            tone === 'success' && 'text-success',
          )}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

/**
 * Order summary panel. Every figure comes from the backend quote — the client
 * never computes money. Coupon entry is collapsed behind a disclosure, the way
 * Jumia keeps it out of the way until it is needed.
 */
export default function OrderSummary({
  quote,
  loading,
  couponCode,
  onApplyCoupon,
  onRemoveCoupon,
  couponError,
  children,
  showCoupon = true,
  itemCount,
}) {
  const [code, setCode] = useState(couponCode || '')
  const [openCoupon, setOpenCoupon] = useState(Boolean(couponCode))

  useEffect(() => {
    if (couponCode) {
      setCode(couponCode)
      setOpenCoupon(true)
    }
  }, [couponCode])

  const applied = Boolean(quote?.coupon?.valid)
  const countLabel = itemCount != null ? ` (${itemCount} ${itemCount === 1 ? 'item' : 'items'})` : ''

  return (
    <div className="rounded-md border border-line bg-white p-5">
      <h2 className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">Order summary</h2>

      <div className="mt-4">
        <Row label={`Subtotal${countLabel}`} value={formatNaira(quote?.subtotal || 0)} />
        {Number(quote?.discount) > 0 && (
          <Row
            label={`Discount${quote.coupon?.code ? ` (${quote.coupon.code})` : ''}`}
            value={`-${formatNaira(quote.discount)}`}
            tone="success"
          />
        )}
        <Row
          label={quote?.delivery_method === 'pickup' ? 'Store pickup' : 'Delivery'}
          value={
            !quote?.shipping_estimated
              ? 'Select state'
              : Number(quote.shipping_fee) === 0
                ? 'Free'
                : formatNaira(quote.shipping_fee)
          }
          tone={quote?.shipping_estimated && Number(quote.shipping_fee) === 0 ? 'success' : undefined}
        />
        <Row label="Total" value={formatNaira(quote?.total || 0)} strong />
      </div>

      {loading && (
        <p className="mt-2 flex items-center gap-2 text-xs text-metal-400">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Updating totals…
        </p>
      )}

      {showCoupon && (
        <div className="mt-4 border-t border-line pt-4">
          {applied ? (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
              <span className="flex items-center gap-2 font-semibold">
                <Tag className="h-4 w-4" strokeWidth={1.75} /> {quote.coupon.code} applied
              </span>
              <button type="button" onClick={() => (setCode(''), onRemoveCoupon())} className="rounded p-1 hover:bg-emerald-100" aria-label="Remove coupon">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOpenCoupon((o) => !o)}
                aria-expanded={openCoupon}
                className="flex w-full items-center justify-between text-[13px] font-semibold text-ink-900"
              >
                Have a promo code?
                <ChevronDown className={cn('h-4 w-4 text-metal-500 transition-transform', openCoupon && 'rotate-180')} />
              </button>
              {openCoupon && (
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (code.trim()) onApplyCoupon(code.trim().toUpperCase())
                  }}
                >
                  <label htmlFor="coupon" className="sr-only">
                    Promo code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="coupon"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className={cn('input uppercase', couponError && 'input-error')}
                      placeholder="Enter code"
                      autoComplete="off"
                    />
                    <button type="submit" className="btn-outline px-4">
                      Apply
                    </button>
                  </div>
                  {couponError && (
                    <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
                      {couponError}
                    </p>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      )}

      {children}
    </div>
  )
}
