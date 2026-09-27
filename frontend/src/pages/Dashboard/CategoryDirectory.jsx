import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'

import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import { catalogService } from '../../services/productService'
import { categoryIcon } from '../../utils/icons'

/**
 * Account "Categories" tab — the in-shell category directory, now that the
 * storefront navbar no longer carries a category strip.
 */
export default function CategoryDirectory() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories', 'root'],
    queryFn: () => catalogService.categories({ root: true }),
    staleTime: 600_000,
  })

  const roots = (data || []).filter((c) => !c.parent)

  return (
    <div>
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">Categories</h2>
        <p className="mt-1 text-[13px] text-metal-500">Browse the full catalogue by department.</p>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title="Unable to load categories" onRetry={refetch} />
        ) : roots.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            message="Departments will appear here once they are added to the catalogue."
            action={{ label: 'Browse all products', to: '/shop' }}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {roots.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <li key={c.slug}>
                  <Link
                    to={`/category/${c.slug}`}
                    className="group flex h-full flex-col rounded-md border border-line bg-white p-4 transition-colors hover:border-brand-600"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded border border-line bg-metal-50 text-ink-800 transition-colors group-hover:border-brand-600 group-hover:bg-brand-50 group-hover:text-brand-700">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="mt-3 text-[13px] font-semibold leading-snug text-ink-900">{c.name}</span>
                    <span className="mt-0.5 text-[11px] text-metal-400">
                      {c.product_count} product{c.product_count === 1 ? '' : 's'}
                    </span>
                    {c.children?.length > 0 && (
                      <span className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-metal-400">
                        {c.children.map((ch) => ch.name).join(', ')}
                      </span>
                    )}
                    <span className="mt-auto flex items-center gap-1 pt-3 text-[12px] font-semibold text-brand-700">
                      Shop <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={2} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
