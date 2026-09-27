import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { SearchX, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { ProductGridSkeleton } from '../../components/Loader/Skeleton'
import Pagination from '../../components/Pagination/Pagination'
import ProductGrid from '../../components/ProductGrid/ProductGrid'
import Seo from '../../components/Seo/Seo'
import useLockBody from '../../hooks/useLockBody'
import { catalogService, productService } from '../../services/productService'
import { cn, formatNaira } from '../../utils/format'
import FilterPanel from './FilterPanel'

const SORTS = [
  { value: '', label: 'Recommended' },
  { value: '-created_at', label: 'Newest' },
  { value: 'effective_price', label: 'Price: Low to High' },
  { value: '-effective_price', label: 'Price: High to Low' },
  { value: '-rating', label: 'Top rated' },
  { value: '-review_count', label: 'Most reviewed' },
  { value: 'name', label: 'Name A–Z' },
]

const FILTER_KEYS = ['brand', 'min_price', 'max_price', 'rating', 'in_stock', 'on_sale', 'min_discount', 'product_type']

export default function Shop() {
  const { categorySlug, brandSlug } = useParams()
  const [params, setParams] = useSearchParams()
  const [drawer, setDrawer] = useState(false)
  useLockBody(drawer)

  const page = Number(params.get('page') || 1)
  const q = params.get('q') || ''

  const setParam = useCallback(
    (updates) => {
      const next = new URLSearchParams(params)
      Object.entries(updates).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k)
        else next.set(k, String(v))
      })
      if (!('page' in updates)) next.delete('page')
      setParams(next)
    },
    [params, setParams],
  )

  const toggleListParam = useCallback(
    (key, value) => {
      const list = (params.get(key) || '').split(',').filter(Boolean)
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      setParam({ [key]: next.join(',') })
    },
    [params, setParam],
  )

  const query = useMemo(() => {
    const obj = Object.fromEntries(params.entries())
    if (categorySlug) obj.category = categorySlug
    if (brandSlug) obj.brand = brandSlug
    obj.page_size = 12
    return obj
  }, [params, categorySlug, brandSlug])

  const products = useQuery({
    queryKey: ['products', 'shop', query],
    queryFn: () => productService.list(query),
    placeholderData: keepPreviousData,
  })
  const facets = useQuery({
    queryKey: ['facets', categorySlug || '', q],
    queryFn: () => productService.facets({ category: categorySlug, q }),
    staleTime: 300_000,
  })
  const category = useQuery({
    queryKey: ['category', categorySlug],
    queryFn: () => catalogService.category(categorySlug),
    enabled: Boolean(categorySlug),
  })
  const brand = useQuery({ queryKey: ['brand', brandSlug], queryFn: () => catalogService.brand(brandSlug), enabled: Boolean(brandSlug) })

  const title = category.data?.name || brand.data?.name || (q ? `Results for “${q}”` : 'Shop all gadgets')
  const description =
    category.data?.description ||
    brand.data?.description ||
    (q ? `Products matching “${q}” at Timeline Gadgets.` : 'Phones, laptops, audio, storage, networking and accessories from Timeline Global Systems.')

  const crumbs = [{ label: 'Shop', to: '/shop' }]
  if (category.data?.parent) crumbs.push({ label: category.data.parent.name, to: `/category/${category.data.parent.slug}` })
  if (category.data) crumbs.push({ label: category.data.name })
  if (brand.data) crumbs.push({ label: 'Brands', to: '/brands' }, { label: brand.data.name })
  if (q) crumbs.push({ label: 'Search' })

  const chips = FILTER_KEYS.flatMap((key) => {
    const value = params.get(key)
    if (!value) return []
    if (key === 'brand' || key === 'product_type')
      return value.split(',').map((v) => ({
        key,
        value: v,
        label: key === 'brand' ? facets.data?.brands?.find((b) => b.slug === v)?.name || v : facets.data?.product_types?.find((t) => t.value === v)?.label || v,
      }))
    const labels = {
      min_price: `From ${formatNaira(value)}`,
      max_price: `Up to ${formatNaira(value)}`,
      rating: `${value}★ & up`,
      in_stock: 'In stock',
      on_sale: 'On sale',
      min_discount: `${value}%+ off`,
    }
    return [{ key, value, label: labels[key] }]
  })

  const removeChip = (chip) => (chip.key === 'brand' || chip.key === 'product_type' ? toggleListParam(chip.key, chip.value) : setParam({ [chip.key]: '' }))
  const clearAll = () => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (params.get('ordering')) next.set('ordering', params.get('ordering'))
    setParams(next)
  }

  const panel = (
    <FilterPanel
      facets={facets.data}
      params={params}
      setParam={setParam}
      toggleListParam={toggleListParam}
      categorySlug={categorySlug}
      currentCategory={category.data}
      brandSlug={brandSlug}
    />
  )

  const data = products.data

  return (
    <>
      <Seo title={title} description={description} noindex={Boolean(q)} />

      <section className="border-b border-line bg-white">
        <div className="container py-5">
          <Breadcrumbs items={crumbs} />
          <motion.h1 key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-3 text-[22px] font-semibold tracking-tight">
            {title}
          </motion.h1>
          {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-metal-500">{description}</p>}
        </div>
      </section>

      <div className="bg-metal-50 py-6">
        <div className="container grid gap-5 lg:grid-cols-[250px_1fr] xl:grid-cols-[270px_1fr]">
          {/* Sticky lives on the aside itself: on a self-start grid item an
              inner sticky child has no room to travel. */}
          <aside className="sticky-chrome hidden lg:block lg:self-start" aria-label="Filters">
            {/* Labelled panel so it reads as a distinct surface from the
                account rail and from the product cards. */}
            <div className="overflow-hidden rounded-md border border-line bg-white">
              <h2 className="border-b border-line px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-ink-900">
                Filters
              </h2>
              <div className="max-h-[calc(100svh-9rem)] overflow-y-auto px-4 pb-2 pt-1">{panel}</div>
            </div>
          </aside>

          <div className="min-w-0">
            {/* Jumia-style result + sort bar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-2.5">
              <p className="text-[13px] text-metal-500" aria-live="polite">
                {data ? (
                  <>
                    <strong className="font-semibold text-ink-900">{data.count.toLocaleString()}</strong>{' '}
                    {data.count === 1 ? 'product' : 'products'}
                    {data.total_pages > 1 && <span className="hidden sm:inline"> &middot; page {data.current_page} of {data.total_pages}</span>}
                  </>
                ) : (
                  'Loading…'
                )}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDrawer(true)} className="btn-outline px-3 py-2 text-[13px] lg:hidden">
                  <SlidersHorizontal className="h-4 w-4" /> Filters{' '}
                  {chips.length > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] leading-4 text-white">{chips.length}</span>}
                </button>
                <label htmlFor="sort" className="hidden text-[13px] text-metal-500 sm:block">
                  Sort by
                </label>
                <select
                  id="sort"
                  value={params.get('ordering') || ''}
                  onChange={(e) => setParam({ ordering: e.target.value })}
                  className="h-9 w-auto rounded border border-line bg-white py-0 pl-3 pr-9 text-[13px] font-medium text-ink-900 focus:border-ink-900 focus:ring-0"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {chips.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <motion.button
                    layout
                    key={`${chip.key}-${chip.value}`}
                    type="button"
                    onClick={() => removeChip(chip)}
                    className="inline-flex items-center gap-1.5 rounded border border-line-strong bg-white py-1 pl-2.5 pr-1.5 text-xs font-medium text-ink-800 transition-colors hover:border-ink-900"
                  >
                    {chip.label} <X className="h-3.5 w-3.5" aria-label="Remove filter" />
                  </motion.button>
                ))}
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                  Clear all
                </button>
              </div>
            )}

            <div className={cn('transition-opacity', products.isFetching && !products.isLoading && 'opacity-60')}>
              {products.isLoading ? (
                <ProductGridSkeleton count={12} className="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" />
              ) : products.isError ? (
                <ErrorState title="Unable to load products" message="Please check your connection and try again." onRetry={products.refetch} />
              ) : data.results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={q ? `No results for “${q}”` : 'No products match these filters'}
                  message={q ? 'Try a different spelling, a brand name or a broader term.' : 'Try removing a filter or two to see more products.'}
                  action={chips.length ? { label: 'Clear filters', onClick: clearAll } : { label: 'Browse all products', to: '/shop' }}
                  secondary={{ label: 'Browse categories', to: '/categories' }}
                />
              ) : (
                <ProductGrid key={JSON.stringify(query)} products={data.results} columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" />
              )}
            </div>

            {data && (
              <Pagination
                page={data.current_page}
                totalPages={data.total_pages}
                onChange={(p) => {
                  setParam({ page: p > 1 ? p : '' })
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.div className="absolute inset-0 bg-ink-950/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-lg bg-white"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="text-base font-semibold">Filters</h2>
                <button type="button" onClick={() => setDrawer(false)} className="rounded p-1.5 hover:bg-metal-100" aria-label="Close filters">
                  <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5">{panel}</div>
              <div className="grid grid-cols-2 gap-3 border-t border-line p-4 pb-safe">
                <button type="button" onClick={clearAll} className="btn-outline">
                  Clear all
                </button>
                <button type="button" onClick={() => setDrawer(false)} className="btn-accent">
                  Show {data?.count ?? ''} results
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
