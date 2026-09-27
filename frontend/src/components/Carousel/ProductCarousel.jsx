import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import QuickViewModal from '../QuickView/QuickViewModal'
import ProductCard from '../ProductCard/ProductCard'

/**
 * Jumia-style product carousel: a section rule, a title with a VIEW ALL link,
 * and a horizontally scrolling row with previous/next controls.
 *
 * Item width is set with responsive `flex-basis` so the number of visible
 * columns is exact at every breakpoint without duplicating the markup.
 */
const BASIS = {
  4: 'basis-[48%] sm:basis-[31%] lg:basis-[calc((100%-1.5rem)/4)]',
  5: 'basis-[48%] sm:basis-[31%] lg:basis-[calc((100%-2.25rem)/5)]',
}

export default function ProductCarousel({ title, subtitle, viewAllTo, viewAllLabel = 'View all', products = [], loading, columns = 5 }) {
  const trackRef = useRef(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [quickView, setQuickView] = useState(null)

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    sync()
    const el = trackRef.current
    if (!el) return undefined
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [sync, products.length])

  const nudge = (dir) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }

  const basis = BASIS[columns] || BASIS[5]

  return (
    <section className="py-8 sm:py-10">
      <div className="container">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-line pb-3">
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-semibold tracking-tight text-ink-900">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] text-metal-500">{subtitle}</p>}
          </div>
          <div className="flex flex-none items-center gap-3">
            {viewAllTo && (
              <Link to={viewAllTo} className="text-[13px] font-semibold text-brand-700 transition-colors hover:text-brand-800">
                {viewAllLabel} →
              </Link>
            )}
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => nudge(-1)}
                disabled={atStart}
                aria-label="Previous products"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-800 transition-colors hover:border-ink-900 disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => nudge(1)}
                disabled={atEnd}
                aria-label="Next products"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-800 transition-colors hover:border-ink-900 disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={columns === 4 ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'}>
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-md bg-metal-100" />
            ))}
          </div>
        ) : products.length === 0 ? null : (
          <div ref={trackRef} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {products.map((p, i) => (
              <div key={p.id} className={`flex-none snap-start ${basis}`}>
                <ProductCard product={p} onQuickView={setQuickView} priority={i < columns} />
              </div>
            ))}
          </div>
        )}
      </div>

      <QuickViewModal slug={quickView?.slug} preview={quickView} onClose={() => setQuickView(null)} />
    </section>
  )
}
