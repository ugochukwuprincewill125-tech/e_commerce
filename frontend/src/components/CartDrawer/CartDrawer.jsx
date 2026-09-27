import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag, Truck, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { useCart } from '../../context/CartContext'
import useLockBody from '../../hooks/useLockBody'
import useStoreInfo from '../../hooks/useStoreInfo'
import { cn, formatNaira } from '../../utils/format'
import Button from '../Button/Button'
import QuantitySelector from '../QuantitySelector/QuantitySelector'

export function CartLine({ item, compact = false }) {
  const { updateItem, removeItem, pending } = useCart()
  const busy = pending === item.id
  const { product } = item
  const overStock = item.quantity > item.available_stock

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: busy ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('grid grid-cols-[64px_1fr] gap-3 py-4 sm:grid-cols-[80px_1fr_auto] sm:gap-4', overStock && 'bg-red-50/40')}
    >
      <Link to={`/products/${product.slug}`} className="h-16 w-16 self-start rounded border border-line bg-white p-1 sm:h-20 sm:w-20">
        {product.image && <img src={product.image} alt={product.name} className="h-full w-full object-contain" loading="lazy" />}
      </Link>

      <div className="min-w-0">
        <Link to={`/products/${product.slug}`} className="line-clamp-2 text-[13px] font-medium leading-snug text-ink-900 transition-colors hover:text-brand-700">
          {product.name}
        </Link>
        {item.selected_variant && <p className="mt-1 text-xs text-metal-500">{item.selected_variant.label}</p>}
        {item.issue && <p className="mt-1 text-xs font-medium text-danger">{item.issue}</p>}
        {overStock && (
          <p className="mt-1 text-xs font-medium text-danger">Only {item.available_stock} left — reduce the quantity to continue</p>
        )}

        <div className="mt-2 flex items-center gap-3 sm:hidden">
          <QuantitySelector
            size="sm"
            value={item.quantity}
            max={Math.max(1, item.available_stock)}
            disabled={busy}
            onChange={(q) => updateItem(item.id, q)}
          />
          <span className="text-[15px] font-bold tabular-nums text-ink-900">{formatNaira(item.line_total)}</span>
        </div>
      </div>

      {/* Jumia-style desktop columns: unit price · quantity · line total · remove */}
      <div className="col-span-2 hidden items-center gap-6 sm:col-span-1 sm:flex">
        <div className="w-24 text-right">
          <p className="text-[13px] font-semibold tabular-nums text-ink-900">{formatNaira(item.unit_price)}</p>
          {!compact && <p className="mt-0.5 text-[11px] text-metal-400">each</p>}
        </div>

        <QuantitySelector
          size="sm"
          value={item.quantity}
          max={Math.max(1, item.available_stock)}
          disabled={busy}
          onChange={(q) => updateItem(item.id, q)}
        />

        <p className="w-24 text-right text-[15px] font-bold tabular-nums text-ink-900">{formatNaira(item.line_total)}</p>

        <button
          type="button"
          onClick={() => removeItem(item.id)}
          disabled={busy}
          className="rounded p-1.5 text-metal-400 transition-colors hover:bg-red-50 hover:text-danger"
          aria-label={`Remove ${product.name} from cart`}
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => removeItem(item.id)}
        disabled={busy}
        className="col-span-2 -mt-1 flex items-center gap-1.5 self-start justify-self-start text-xs font-medium text-metal-500 transition-colors hover:text-danger sm:hidden"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} /> Remove
      </button>
    </motion.li>
  )
}

export default function CartDrawer() {
  const { drawerOpen, closeDrawer, items, itemCount, subtotal } = useCart()
  const { shipping } = useStoreInfo()
  const { pathname } = useLocation()
  useLockBody(drawerOpen)

  useEffect(() => {
    closeDrawer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && closeDrawer()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  const threshold = shipping?.free_shipping_threshold
  const remaining = threshold ? Math.max(0, threshold - Number(subtotal)) : null

  return (
    <AnimatePresence>
      {drawerOpen && (
        <div className="fixed inset-0 z-[70]">
          <motion.div className="absolute inset-0 bg-ink-950/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeDrawer} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-overlay"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">
                Your cart <span className="text-metal-400">({itemCount})</span>
              </h2>
              <button type="button" onClick={closeDrawer} className="rounded p-1.5 text-ink-800 transition-colors hover:bg-metal-100" aria-label="Close cart">
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </header>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded border border-line bg-metal-50">
                  <ShoppingBag className="h-6 w-6 text-ink-800" strokeWidth={1.6} />
                </div>
                <p className="text-base font-semibold">Your cart is empty</p>
                <p className="mt-1.5 text-sm text-metal-500">Browse our latest phones, laptops and accessories.</p>
                <Button to="/shop" className="mt-6">
                  Start shopping
                </Button>
              </div>
            ) : (
              <>
                {remaining !== null && (
                  <div className="border-b border-line bg-metal-50 px-5 py-3">
                    <p className="flex items-center gap-2 text-xs text-metal-600">
                      <Truck className="h-4 w-4 flex-none text-brand-600" strokeWidth={1.75} />
                      {remaining > 0 ? (
                        <>
                          Add <strong className="text-ink-900">{formatNaira(remaining)}</strong> more for free delivery
                        </>
                      ) : (
                        <strong className="text-success">You qualify for free delivery!</strong>
                      )}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-metal-200">
                      <motion.div
                        className="h-full rounded-full bg-brand-600"
                        initial={false}
                        animate={{ width: `${Math.min(100, (Number(subtotal) / threshold) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <CartLine key={item.id} item={item} compact />
                    ))}
                  </AnimatePresence>
                </ul>
                <footer className="border-t border-line p-5 pb-safe">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-metal-500">Subtotal</span>
                    <span className="text-xl font-bold tabular-nums text-ink-900">{formatNaira(subtotal)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-metal-400">Delivery and discounts are calculated at checkout.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <Button to="/cart" variant="outline">
                      View cart
                    </Button>
                    <Button to="/checkout" variant="accent">
                      Checkout
                    </Button>
                  </div>
                </footer>
              </>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
