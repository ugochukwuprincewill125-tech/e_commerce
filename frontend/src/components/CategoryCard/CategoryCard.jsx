import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { categoryIcon } from '../../utils/icons'
import { cn } from '../../utils/format'

/**
 * Category tile. Solid ink plate, no image overlay gradient, square geometry —
 * it sits next to product tiles so it should read as the same family of object.
 */
export default function CategoryCard({ category, variant = 'tile', className }) {
  const Icon = categoryIcon(category.icon)

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

  return (
    <Link
      to={`/category/${category.slug}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-lg bg-ink-900 p-5 text-white transition-colors hover:bg-ink-800',
        className,
      )}
    >
      {category.image && (
        <img
          src={category.image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain opacity-15"
        />
      )}
      <div className="relative flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded border border-white/15 bg-white/5">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <ArrowUpRight className="h-4 w-4 text-metal-500 transition-colors group-hover:text-white" aria-hidden />
      </div>
      <div className="relative mt-auto pt-16">
        <h3 className="text-base font-semibold leading-snug">{category.name}</h3>
        <p className="mt-1.5 text-xs text-metal-400">
          {category.product_count} product{category.product_count === 1 ? '' : 's'}
        </p>
      </div>
    </Link>
  )
}
