import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, LoaderCircle, Search, SearchX, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import useDebounce from '../../hooks/useDebounce'
import { productService } from '../../services/productService'
import { cn, formatNaira } from '../../utils/format'

/**
 * Debounced search with live suggestions (products, categories, brands).
 * Enter submits to the shop page, scoped to `scope` (a category slug) when set;
 * arrow keys move through product suggestions.
 *
 * `grouped` drops the right-hand radius and border so the field butts up
 * against an adjacent SEARCH button.
 */
export default function SearchBar({ className, autoFocus = false, onNavigate, scope = '', grouped = false, placeholder }) {
  const navigate = useNavigate()
  const listId = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const wrapper = useRef(null)
  const term = useDebounce(q.trim(), 280)

  const { data, isFetching } = useQuery({
    queryKey: ['suggestions', term, scope],
    queryFn: ({ signal }) => productService.suggestions(term, signal),
    enabled: term.length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const onClick = (e) => wrapper.current && !wrapper.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => setCursor(-1), [term])

  const go = (to) => {
    setOpen(false)
    setQ('')
    onNavigate?.()
    navigate(to)
  }

  const searchPath = (term) => (scope ? `/category/${scope}?q=${encodeURIComponent(term)}` : `/shop?q=${encodeURIComponent(term)}`)

  const submit = (e) => {
    e.preventDefault()
    const products = data?.products || []
    if (cursor >= 0 && products[cursor]) return go(`/products/${products[cursor].slug}`)
    if (q.trim()) go(searchPath(q.trim()))
    return undefined
  }

  const onKeyDown = (e) => {
    const n = data?.products?.length || 0
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(n - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(-1, c - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showPanel = open && term.length >= 2 && data

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <form onSubmit={submit} role="search">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search products
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-metal-400" />
          <input
            id={`${listId}-input`}
            type="search"
            autoComplete="off"
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder || 'Search for products, brands and categories'}
            role="combobox"
            aria-expanded={Boolean(showPanel)}
            aria-controls={listId}
            aria-autocomplete="list"
            className={cn(
              'h-11 w-full border bg-white pl-10 pr-10 text-[13px] text-ink-900 transition-colors placeholder:text-metal-400 focus:border-ink-900 focus:bg-white focus:ring-0',
              grouped ? 'rounded-l-md border-r-0' : 'rounded-md',
            )}
          />
          {isFetching ? (
            <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-metal-400" />
          ) : (
            q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-metal-400 hover:text-ink-900" aria-label="Clear search">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )
          )}
        </div>
      </form>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-md border border-line bg-white text-ink-900 shadow-overlay',
              !grouped && 'sm:min-w-[440px]',
            )}
          >
            {data.total === 0 ? (
              <div className="flex items-center gap-3 p-4 text-sm text-metal-500">
                <SearchX className="h-4 w-4 flex-none" /> No products match &ldquo;{term}&rdquo;. Try a brand or category name.
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                {(data.categories.length > 0 || data.brands.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 border-b border-line p-2.5">
                    {data.categories.map((c) => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => go(`/category/${c.slug}`)}
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-metal-600 transition-colors hover:border-ink-900 hover:text-ink-900"
                      >
                        {c.name}
                      </button>
                    ))}
                    {data.brands.map((b) => (
                      <button
                        key={b.slug}
                        type="button"
                        onClick={() => go(`/brands/${b.slug}`)}
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-metal-600 transition-colors hover:border-ink-900 hover:text-ink-900"
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
                <ul className="p-1.5">
                  {data.products.map((p, i) => (
                    <li key={p.id} role="option" aria-selected={cursor === i}>
                      <Link
                        to={`/products/${p.slug}`}
                        onClick={() => go(`/products/${p.slug}`)}
                        onMouseEnter={() => setCursor(i)}
                        className={cn('flex items-center gap-3 rounded p-2', cursor === i && 'bg-brand-50')}
                      >
                        <span className="h-11 w-11 flex-none rounded border border-line bg-white p-1">
                          {p.image && <img src={p.image} alt="" className="h-full w-full object-contain" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-[13px] font-medium text-ink-900">{p.name}</span>
                          <span className="line-clamp-1 text-xs text-metal-400">
                            {p.brand ? `${p.brand} · ` : ''}
                            {p.category}
                          </span>
                        </span>
                        <span className="flex-none text-[13px] font-bold text-ink-900">{formatNaira(p.current_price)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => go(searchPath(term))}
                  className="flex w-full items-center justify-between border-t border-line bg-metal-50 px-4 py-2.5 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-metal-100"
                >
                  See all {data.total} results for &ldquo;{term}&rdquo;
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
