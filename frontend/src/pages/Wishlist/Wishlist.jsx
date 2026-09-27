import { AnimatePresence, motion } from 'framer-motion'
import { Heart, ShoppingBag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { ProductGridSkeleton } from '../../components/Loader/Skeleton'
import { useWishlist } from '../../context/WishlistContext'
import { formatNaira } from '../../utils/format'

export default function Wishlist() {
  const { items, isLoading, isError, toggle, moveToCart, pending } = useWishlist()

  if (isLoading) return <ProductGridSkeleton count={6} className="md:grid-cols-3 xl:grid-cols-3" />
  if (isError) return <ErrorState title="Unable to load your wishlist" />
  if (!items.length) {
    return (
      <EmptyState
        icon={Heart}
        title="Your wishlist is empty"
        message="Tap the heart on any product to save it here for later."
        action={{ label: 'Discover products', to: '/shop' }}
      />
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold">
        Wishlist <span className="text-metal-300">({items.length})</span>
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {items.map(({ id, product }) => {
            const soldOut = product.availability === 'out_of_stock'
            const busy = pending === product.id
            return (
              <motion.li key={id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="card flex flex-col overflow-hidden">
                <Link to={`/products/${product.slug}`} className="relative block aspect-[4/3] bg-metal-50">
                  {product.image && <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover" />}
                  {soldOut && <span className="chip absolute left-3 top-3 bg-ink-900 text-white">Sold out</span>}
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  {product.brand && <p className="text-[11px] font-semibold uppercase tracking-wider text-metal-400">{product.brand.name}</p>}
                  <Link to={`/products/${product.slug}`} className="mt-1 line-clamp-2 text-sm font-semibold hover:text-brand-600">
                    {product.name}
                  </Link>
                  <p className="mt-2 font-bold">
                    {formatNaira(product.current_price)}
                    {product.discount_price && <span className="ml-2 text-xs font-normal text-metal-400 line-through">{formatNaira(product.price)}</span>}
                  </p>
                  <div className="mt-auto flex gap-2 pt-4">
                    <Button size="sm" className="flex-1" icon={ShoppingBag} disabled={soldOut} loading={busy} onClick={() => moveToCart(product)}>
                      {soldOut ? 'Out of stock' : 'Move to cart'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => toggle(product)}
                      disabled={busy}
                      className="rounded-lg border border-metal-200 p-2 text-metal-500 transition hover:border-danger hover:text-danger"
                      aria-label={`Remove ${product.name} from wishlist`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}
