import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'

import { useWishlist } from '../../context/WishlistContext'
import { cn } from '../../utils/format'

/** Heart toggle. Square hit area and a restrained pop — no burst ring. */
export default function WishlistButton({ product, className, size = 'md', withLabel = false }) {
  const { has, toggle, pending } = useWishlist()
  const saved = has(product.id)
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(product)
      }}
      whileTap={{ scale: 0.92 }}
      disabled={pending === product.id}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className={cn(
        'relative inline-flex items-center justify-center rounded transition-colors',
        withLabel
          ? 'h-11 gap-2 border border-line-strong bg-white px-4 text-[13px] font-semibold text-ink-900 hover:border-ink-900'
          : cn(dim, 'border border-line bg-white text-ink-800 hover:border-ink-900 hover:text-ink-900'),
        className,
      )}
    >
      <motion.span key={saved ? 'on' : 'off'} initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ duration: 0.18 }}>
        <Heart className={cn('h-4 w-4', saved ? 'fill-danger text-danger' : 'text-ink-800')} strokeWidth={1.9} />
      </motion.span>
      {withLabel && <span>{saved ? 'Saved' : 'Add to Wishlist'}</span>}
    </motion.button>
  )
}
