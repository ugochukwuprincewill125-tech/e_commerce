import { motion } from 'framer-motion'
import { Eye, LoaderCircle, ShoppingCart } from 'lucide-react'
import { memo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useCart } from '../../context/CartContext'
import { cn, formatNaira } from '../../utils/format'
import Rating from '../Rating/Rating'
import WishlistButton from '../WishlistButton/WishlistButton'

export function ProductBadges({ product, className }) {
  const soldOut = product.availability === 'out_of_stock'
  if (soldOut) return <span className={cn('chip bg-metal-200 text-metal-600', className)}>Sold out</span>
  if (product.discount_percent > 0) return <span className={cn('chip bg-danger text-white', className)}>-{product.discount_percent}%</span>
  if (product.new_arrival) return <span className={cn('chip border border-line-strong bg-white text-ink-800', className)}>New</span>
  return null
}

/**
 * Catalogue tile. Deliberately dense — the information stack is fixed
 * (image → title → rating → price → delivery → action) so every card in a
 * Jumia-style grid lines up regardless of title length, and the price block
 * reads first.
 */
function ProductCard({ product, onQuickView, priority = false }) {
  const { addItem, pending } = useCart()
  const [loaded, setLoaded] = useState(false)
  const soldOut = product.availability === 'out_of_stock'
  const adding = pending === product.id
  const url = `/products/${product.slug}`
  const hasDiscount = product.discount_percent > 0

  const handleAdd = (e) => {
    e.preventDefault()
    if (soldOut) return
    if (product.has_variants && onQuickView) onQuickView(product)
    else addItem(product, 1).catch(() => {})
  }

  return (
    <article className="group relative flex h-full flex-col rounded-md border border-line bg-white transition-colors hover:border-brand-600">
      <Link to={url} className="relative block border-b border-line bg-white" aria-label={product.name}>
        <div className="aspect-square p-3">
          {product.image ? (
            <>
              <img
                src={product.image}
                alt={product.name}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                onLoad={() => setLoaded(true)}
                ref={(el) => {
                  if (el && el.complete && el.naturalWidth && !loaded) setLoaded(true)
                }}
                className={cn(
                  'h-full w-full object-contain transition-opacity duration-200',
                  loaded ? 'opacity-100' : 'opacity-0',
                  product.hover_image && 'group-hover:opacity-0',
                )}
              />
              {product.hover_image && (
                <img
                  src={product.hover_image}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="absolute inset-0 h-full w-full p-3 object-contain opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-metal-400">No image</div>
          )}
        </div>

        <ProductBadges product={product} className="absolute left-0 top-2" />

        {onQuickView && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 hidden translate-y-1 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 lg:block">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onQuickView(product)
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-line-strong bg-white py-1.5 text-[11px] font-semibold text-ink-900 transition-colors hover:border-ink-900 hover:bg-ink-900 hover:text-white"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden /> Quick view
            </button>
          </div>
        )}
      </Link>

      <div className="absolute right-1.5 top-1.5 transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100 lg:[&:has([aria-pressed=true])]:opacity-100">
        <WishlistButton product={product} size="sm" />
      </div>

      <div className="flex flex-1 flex-col p-3">
        {product.brand && <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-metal-400">{product.brand.name}</p>}

        <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-5 text-ink-900">
          <Link to={url} className="transition-colors hover:text-brand-700">
            {product.name}
          </Link>
        </h3>

        <div className="mt-1.5 flex h-4 items-center">
          {Number(product.review_count) > 0 ? (
            <Rating value={product.rating} count={product.review_count} size="h-3 w-3" />
          ) : (
            <span className="text-[11px] text-metal-400">No reviews</span>
          )}
        </div>

        {/* Price block — the primary scan target */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[17px] font-bold leading-none text-ink-900">{formatNaira(product.current_price)}</span>
          {hasDiscount && <span className="text-xs text-metal-400 line-through">{formatNaira(product.price)}</span>}
        </div>

        <p className="mt-1.5 text-[11px] leading-tight">
          {soldOut ? (
            <span className="font-medium text-metal-500">Out of stock</span>
          ) : product.availability === 'low_stock' ? (
            <span className="font-medium text-warning">Only a few left</span>
          ) : (
            <span className="font-medium text-success">In stock</span>
          )}
        </p>

        <div className="mt-auto pt-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleAdd}
            disabled={soldOut || adding}
            aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`}
            className={cn(
              'flex h-9 w-full items-center justify-center gap-1.5 rounded border text-[12px] font-semibold transition-colors',
              soldOut
                ? 'cursor-not-allowed border-line bg-metal-100 text-metal-400'
                : 'border-brand-600 bg-brand-600 text-white hover:border-brand-700 hover:bg-brand-700',
            )}
          >
            {adding ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
            {soldOut ? 'Sold out' : 'Add to cart'}
          </motion.button>
        </div>
      </div>
    </article>
  )
}

export default memo(ProductCard)
