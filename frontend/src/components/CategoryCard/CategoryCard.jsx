import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { categoryIcon } from '../../utils/icons'
import { cn } from '../../utils/format'

/**
 * Category tile. Without an image it is a solid ink plate with just the icon;
 * with one (uploaded in the admin) the photo fills the plate under a bottom
 * gradient so the name keeps its contrast. A broken image URL (dead file,
 * storage hiccup) falls back to the plain tile instead of a broken glyph.
 * Square geometry — it sits next to product tiles so it should read as the
 * same family of object.
 */
export default function CategoryCard({ category, variant = 'tile', className }) {
  const Icon = categoryIcon(category.icon)
  const [imageFailed, setImageFailed] = useState(false)

  if (variant === 'compact') {
    return (
      <Link
        to={`/category/${category.slug}`}
        className={cn('group flex items-center gap-3 rounded border border-line bg-white p-3 transition-colors hover:border-ink-900', className)}
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded bg-metal-100 text-ink-900 transition-colors group-hover:bg-ink-900 group-hover:text-white">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{category.name}</span>
          <span className="text-xs text-metal-400">{category.product_count} products</span>
        </span>
      </Link>
    )
  }

  const showImage = Boolean(category.image) && !imageFailed

  return (
    <Link
      to={`/category/${category.slug}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-lg bg-ink-900 p-5 text-white transition-colors hover:bg-ink-800',
        className,
      )}
    >
      {showImage && (
        <>
          <img
            src={category.image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/35 to-ink-950/10" aria-hidden />
        </>
      )}
      <div className="relative flex items-start justify-between">
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded border',
            showImage ? 'border-white/20 bg-ink-950/40 backdrop-blur-sm' : 'border-white/15 bg-white/5',
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <ArrowUpRight
          className={cn('h-4 w-4 transition-colors group-hover:text-white', showImage ? 'text-white/70' : 'text-metal-500')}
          aria-hidden
        />
      </div>
      <div className="relative mt-auto pt-16">
        <h3 className="text-base font-semibold leading-snug text-white">{category.name}</h3>
        <p className={cn('mt-1.5 text-xs', showImage ? 'text-white/75' : 'text-metal-400')}>
          {category.product_count} product{category.product_count === 1 ? '' : 's'}
        </p>
      </div>
    </Link>
  )
}
