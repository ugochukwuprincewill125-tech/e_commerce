import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { useState } from 'react'

import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { ProductGridSkeleton } from '../../components/Loader/Skeleton'
import Pagination from '../../components/Pagination/Pagination'
import ProductGrid from '../../components/ProductGrid/ProductGrid'
import { productService } from '../../services/productService'

/**
 * Account "Home" tab — the first destination after signing in or registering.
 *
 * Lists every product added to the catalogue, newest first, across all
 * categories. No category filter is applied: this is a chronological feed of
 * the whole storefront.
 */
export default function HomeFeed() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'account-home', page],
    queryFn: () => productService.list({ ordering: '-created_at', page, page_size: 24 }),
    placeholderData: keepPreviousData,
  })

  const results = data?.results || []

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">New arrivals</h2>
          <p className="mt-1 text-[13px] text-metal-500">
            The most recently added products across every category, newest first.
          </p>
        </div>
        {data && (
          <p className="text-[13px] text-metal-500">
            <strong className="font-semibold text-ink-900">{data.count.toLocaleString()}</strong>{' '}
            {data.count === 1 ? 'product' : 'products'}
          </p>
        )}
      </div>

      <div className="mt-4">
        {isLoading ? (
          <ProductGridSkeleton count={12} className="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" />
        ) : isError ? (
          <ErrorState title="Unable to load products" message="Please check your connection and try again." onRetry={refetch} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            message="Newly added products will appear here as soon as they are listed."
            action={{ label: 'Browse the shop', to: '/shop' }}
          />
        ) : (
          <>
            <ProductGrid key={page} products={results} columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" />
            <Pagination
              page={data.current_page}
              totalPages={data.total_pages}
              onChange={(p) => {
                setPage(p)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
