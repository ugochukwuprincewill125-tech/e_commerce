import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight, Lock, MapPin, ShoppingBag, Trash2, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import { CartLine } from '../../components/CartDrawer/CartDrawer'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import OrderSummary from '../../components/OrderSummary/OrderSummary'
import Seo from '../../components/Seo/Seo'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import useCheckoutPrefs from '../../hooks/useCheckoutPrefs'
import useQuote from '../../hooks/useQuote'
import useStoreInfo from '../../hooks/useStoreInfo'
import { errorMessage } from '../../services/api'
import { cartService } from '../../services/cartService'
import { cn, formatNaira } from '../../utils/format'

/** Jumia-style free-delivery threshold progress. */
function FreeDeliveryMeter({ subtotal, threshold }) {
  if (!threshold) return null
  const remaining = Math.max(0, Number(threshold) - Number(subtotal))
  const pct = Math.min(100, (Number(subtotal) / Number(threshold)) * 100)
  return (
    <div className="mb-4 rounded-md border border-line bg-white px-4 py-3">
      <p className="flex items-center gap-2 text-[13px]">
        <Truck className="h-4 w-4 flex-none text-brand-600" strokeWidth={1.75} />
        {remaining > 0 ? (
          <span className="text-metal-600">
            Add <strong className="font-semibold text-ink-900">{formatNaira(remaining)}</strong> more to qualify for free
            delivery
          </span>
        ) : (
          <strong className="text-success">You have qualified for free delivery</strong>
        )}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-metal-200">
        <motion.div className="h-full rounded-full bg-brand-600" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
      </div>
    </div>
  )
}

export default function Cart() {
  const { items, itemCount, isLoading, isError, refresh, clearCart, hasIssues, subtotal } = useCart()
  const { states, shipping } = useStoreInfo()
  const [prefs, setPrefs] = useCheckoutPrefs()
  const [couponError, setCouponError] = useState('')
  const toast = useToast()
  const quote = useQuote(prefs)

  // Drop a coupon that the server no longer accepts (e.g. cart dropped below the minimum).
  useEffect(() => {
    if (prefs.coupon_code && quote.data && !quote.data.coupon?.valid) {
      setCouponError(quote.data.coupon?.message || '')
    }
  }, [quote.data, prefs.coupon_code])

  const applyCoupon = async (code) => {
    setCouponError('')
    try {
      const res = await cartService.applyCoupon({ code, state: prefs.state, delivery_method: prefs.delivery_method })
      setPrefs({ coupon_code: code })
      toast.success(res.detail)
    } catch (err) {
      setCouponError(errorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div className="container py-10">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-80 w-full rounded-md" />
          <Skeleton className="h-80 w-full rounded-md" />
        </div>
      </div>
    )
  }
  if (isError) return <ErrorState title="Unable to load your cart" onRetry={refresh} className="py-28" />

  if (!items.length) {
    return (
      <>
        <Seo title="Your cart" noindex />
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          message="You have not added anything yet. Explore phones, laptops and accessories at competitive prices."
          action={{ label: 'Start shopping', to: '/shop' }}
          secondary={{ label: 'Browse categories', to: '/categories' }}
          className="py-28"
        />
      </>
    )
  }

  return (
    <>
      <Seo title="Your cart" noindex />

      <div className="border-b border-line bg-white">
        <div className="container py-5">
          <Breadcrumbs items={[{ label: 'Cart' }]} />
          <div className="mt-3 flex items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
              My cart <span className="text-metal-400">({itemCount})</span>
            </h1>
            <button
              type="button"
              onClick={() => clearCart().then(() => toast.info('Your cart has been cleared.'))}
              className="flex items-center gap-1.5 text-[13px] font-medium text-metal-500 transition-colors hover:text-danger"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} /> Clear cart
            </button>
          </div>
        </div>
      </div>

      <div className="bg-metal-50 py-6">
        <div className="container grid items-start gap-5 lg:grid-cols-[1fr_340px]">
          {/* Line items */}
          <div className="min-w-0">
            {hasIssues && (
              <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.75} />
                <span>Some items need attention — adjust quantities or remove unavailable items before checkout.</span>
              </div>
            )}

            <FreeDeliveryMeter subtotal={subtotal} threshold={shipping?.free_shipping_threshold} />

            <div className="rounded-md border border-line bg-white px-4 sm:px-5">
              <AnimatePresence initial={false}>
                <ul className="divide-y divide-line">
                  {items.map((item) => (
                    <CartLine key={item.id} item={item} />
                  ))}
                </ul>
              </AnimatePresence>
            </div>

            <Button to="/shop" variant="ghost" icon={ArrowLeft} className="mt-4 -ml-3">
              Continue shopping
            </Button>
          </div>

          {/* Summary column */}
          <div className="space-y-4 lg:sticky lg:top-32">
            {/* Fulfilment method */}
            <div className="rounded-md border border-line bg-white p-5">
              <h2 className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">Fulfilment</h2>

              <div className="mt-3.5 grid grid-cols-2 gap-2">
                {[
                  ['delivery', 'Delivery', Truck],
                  ['pickup', 'Store pickup', MapPin],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPrefs({ delivery_method: value })}
                    aria-pressed={prefs.delivery_method === value}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded border px-3 py-2.5 text-[12px] font-medium transition-colors',
                      prefs.delivery_method === value
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-line bg-white text-metal-600 hover:border-ink-900 hover:text-ink-900',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </div>

              {prefs.delivery_method === 'delivery' && (
                <div className="mt-4">
                  <label htmlFor="ship-state" className="label">
                    Delivery state
                  </label>
                  <select id="ship-state" className="input" value={prefs.state} onChange={(e) => setPrefs({ state: e.target.value })}>
                    <option value="">Select your state</option>
                    {states.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-metal-400">Delivery fees are calculated for your state.</p>
                </div>
              )}
            </div>

            <OrderSummary
              quote={quote.data}
              loading={quote.isFetching}
              itemCount={itemCount}
              couponCode={prefs.coupon_code}
              couponError={couponError}
              onApplyCoupon={applyCoupon}
              onRemoveCoupon={() => {
                setPrefs({ coupon_code: '' })
                setCouponError('')
              }}
            >
              <Button
                to="/checkout"
                size="lg"
                variant="accent"
                className="mt-5 w-full"
                iconRight={ArrowRight}
                disabled={hasIssues}
                onClick={(e) => hasIssues && e.preventDefault()}
              >
                Proceed to checkout
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-metal-400">
                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} /> All prices are confirmed by our server
              </p>
            </OrderSummary>
          </div>
        </div>
      </div>
    </>
  )
}
