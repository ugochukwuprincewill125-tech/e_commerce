import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Package, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { ProductGridSkeleton } from '../../components/Loader/Skeleton'
import Pagination from '../../components/Pagination/Pagination'
import ProductGrid from '../../components/ProductGrid/ProductGrid'
import useDebounce from '../../hooks/useDebounce'
import { productService } from '../../services/productService'

/**
 * Account "Home" tab — the first destination after signing in or registering.
 *
 * Lists every product added to the catalogue, newest first, across all
 * categories. No category filter is applied: this is a chronological feed of
 * the whole storefront.
 *
 * The search field at the top narrows that feed down to matching products.
 * It is pinned to the top of the column, so a customer working through a
 * long catalogue can start another search without scrolling back up first.
 */
export default function HomeFeed() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  // Wait for a pause in typing before asking the API for anything.
  const term = useDebounce(search.trim(), 300)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'account-home', term, page],
    queryFn: () => productService.list({ q: term, ordering: '-created_at', page, page_size: 24 }),
    placeholderData: keepPreviousData,
  })

  const results = data?.results || []
  const searching = term.length > 0

  // A new set of results replaces the old one, so take the customer back to
  // the top of the feed rather than leaving them in the middle of it.
  const firstSearch = useRef(true)
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [term])

  const clearSearch = () => {
    setSearch('')
    setPage(1)
  }

  return (
    <div>
      {/* Search. Sticky so it stays reachable while the catalogue scrolls
          underneath: below the 60px mobile account bar on small screens, and
          at the very top of the content column on wide ones, where there is
          no bar above. The background is opaque, matching the column it
          sits in, so the grid never shows through it. */}
      <div className="sticky top-[60px] z-30 mb-5 border-b border-line bg-metal-50 py-3 lg:top-0">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-metal-400"
            strokeWidth={1.75}
          />
          <label htmlFor="account-home-search" className="sr-only">
            Search products
          </label>
          <input
            id="account-home-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search products by name…"
            autoComplete="off"
            className="input h-11 pl-11 pr-11"
          />
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-metal-400 transition-colors hover:text-brand-700"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">
            {searching ? 'Search results' : 'New arrivals'}
          </h2>
          <p className="mt-1 text-[13px] text-metal-500">
            {searching
              ? `Products matching “${term}”.`
              : 'The most recently added products across every category, newest first.'}
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
          searching ? (
            <EmptyState
              icon={Search}
              title="No matching products"
              message={`Nothing in the catalogue matches “${term}”. Try a different name or browse the full range.`}
              action={{ label: 'Clear search', onClick: clearSearch }}
              secondary={{ label: 'Browse the shop', to: '/shop' }}
            />
          ) : (
            <EmptyState
              icon={Package}
              title="No products yet"
              message="Newly added products will appear here as soon as they are listed."
              action={{ label: 'Browse the shop', to: '/shop' }}
            />
          )
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
