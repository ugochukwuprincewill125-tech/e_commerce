import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { categoryIcon } from '../../utils/icons'
import { cn, formatNaira } from '../../utils/format'

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-line py-5 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-ink-900" aria-expanded={open}>
        {title}
        <ChevronDown className={cn('h-4 w-4 text-metal-400 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Check({ checked, onChange, label, count }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-ink-800">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-metal-300 text-ink-900 focus:ring-brand-500" />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-metal-400">{count}</span>}
    </label>
  )
}

const PRICE_PRESETS = [
  { label: 'Under ₦20k', min: '', max: 20000 },
  { label: '₦20k – ₦100k', min: 20000, max: 100000 },
  { label: '₦100k – ₦500k', min: 100000, max: 500000 },
  { label: 'Above ₦500k', min: 500000, max: '' },
]

/**
 * All filter state lives in the URL (see Shop.jsx) so filtered pages can be
 * shared and survive refreshes.
 */
export default function FilterPanel({ facets, params, setParam, toggleListParam, categorySlug, currentCategory, brandSlug }) {
  const [minPrice, setMinPrice] = useState(params.get('min_price') || '')
  const [maxPrice, setMaxPrice] = useState(params.get('max_price') || '')

  useEffect(() => {
    setMinPrice(params.get('min_price') || '')
    setMaxPrice(params.get('max_price') || '')
  }, [params])

  const selectedBrands = (params.get('brand') || '').split(',').filter(Boolean)
  const selectedTypes = (params.get('product_type') || '').split(',').filter(Boolean)
  const rating = params.get('rating')
  const minDiscount = params.get('min_discount')
  const shopBase = (slug) => `/category/${slug}${params.toString() ? `?${params.toString()}` : ''}`

  return (
    <div>
      <Section title="Categories">
        {currentCategory?.parent && (
          <Link to={`/category/${currentCategory.parent.slug}`} className="mb-2 block text-xs font-semibold text-brand-600">
            ← {currentCategory.parent.name}
          </Link>
        )}
        {currentCategory?.children?.length > 0 ? (
          <ul className="space-y-1">
            {currentCategory.children.map((c) => (
              <li key={c.slug}>
                <Link to={shopBase(c.slug)} className="block rounded-lg px-2 py-1.5 text-sm text-ink-800 hover:bg-metal-50">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
            <li>
              <Link to="/shop" className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', !categorySlug ? 'bg-ink-900 text-white' : 'text-ink-800 hover:bg-metal-50')}>
                All products
              </Link>
            </li>
            {facets?.categories?.map((c) => {
              const Icon = categoryIcon(c.icon)
              const active = c.slug === categorySlug
              return (
                <li key={c.slug}>
                  <Link to={shopBase(c.slug)} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', active ? 'bg-ink-900 text-white' : 'text-ink-800 hover:bg-metal-50')}>
                    <Icon className="h-4 w-4 flex-none opacity-70" /> {c.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {!brandSlug && facets?.brands?.length > 0 && (
        <Section title="Brands">
          <div className="max-h-64 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <Check key={b.slug} label={b.name} count={b.count} checked={selectedBrands.includes(b.slug)} onChange={() => toggleListParam('brand', b.slug)} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Price range">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setParam({ min_price: minPrice, max_price: maxPrice })
          }}
        >
          <label className="flex-1">
            <span className="mb-1 block text-xs text-metal-500">Min (₦)</span>
            <input type="number" min="0" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={facets ? String(Math.floor(facets.price.min)) : '0'} className="input px-3 py-2" />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-metal-500">Max (₦)</span>
            <input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={facets ? String(Math.ceil(facets.price.max)) : 'Any'} className="input px-3 py-2" />
          </label>
          <button type="submit" className="btn-primary px-3.5 py-2.5">
            Go
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRICE_PRESETS.map((p) => {
            const active = String(params.get('min_price') || '') === String(p.min) && String(params.get('max_price') || '') === String(p.max)
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setParam({ min_price: p.min, max_price: p.max })}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', active ? 'border-ink-900 bg-ink-900 text-white' : 'border-metal-200 hover:border-ink-900')}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        {facets && (
          <p className="mt-3 text-xs text-metal-400">
            Prices range from {formatNaira(facets.price.min)} to {formatNaira(facets.price.max)}
          </p>
        )}
      </Section>

      <Section title="Rating">
        {[4, 3].map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
            <input type="radio" name="rating" checked={rating === String(r)} onChange={() => setParam({ rating: r })} className="h-4 w-4 border-metal-300 text-ink-900 focus:ring-brand-500" />
            <span className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn('h-3.5 w-3.5', i < r ? 'text-amber-400' : 'text-metal-200')} fill="currentColor" strokeWidth={0} />
              ))}
              <span className="ml-1 text-metal-500">& up</span>
            </span>
          </label>
        ))}
        {rating && (
          <button type="button" onClick={() => setParam({ rating: '' })} className="mt-1 text-xs font-semibold text-brand-600">
            Clear rating
          </button>
        )}
      </Section>

      <Section title="Availability">
        <Check label="In stock only" count={facets?.in_stock_count} checked={params.get('in_stock') === 'true'} onChange={() => setParam({ in_stock: params.get('in_stock') === 'true' ? '' : 'true' })} />
      </Section>

      <Section title="Discount">
        <Check label="On sale" count={facets?.on_sale_count} checked={params.get('on_sale') === 'true'} onChange={() => setParam({ on_sale: params.get('on_sale') === 'true' ? '' : 'true' })} />
        {[10, 20].map((d) => (
          <Check key={d} label={`${d}% off or more`} checked={minDiscount === String(d)} onChange={() => setParam({ min_discount: minDiscount === String(d) ? '' : d })} />
        ))}
      </Section>

      {facets?.product_types?.length > 1 && (
        <Section title="Product type">
          {facets.product_types.map((t) => (
            <Check key={t.value} label={t.label} count={t.count} checked={selectedTypes.includes(t.value)} onChange={() => toggleListParam('product_type', t.value)} />
          ))}
        </Section>
      )}
    </div>
  )
}
