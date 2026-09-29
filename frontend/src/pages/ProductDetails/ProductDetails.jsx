import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CreditCard, PackageX, RotateCcw, ShoppingBag, Store, Truck, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import ProductCarousel from '../../components/Carousel/ProductCarousel'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { ProductDetailsSkeleton, ProductGridSkeleton } from '../../components/Loader/Skeleton'
import Reveal from '../../components/Motion/Reveal'
import ProductGrid from '../../components/ProductGrid/ProductGrid'
import QuantitySelector from '../../components/QuantitySelector/QuantitySelector'
import Rating from '../../components/Rating/Rating'
import SectionHeading from '../../components/Section/SectionHeading'
import Seo from '../../components/Seo/Seo'
import VariantPicker from '../../components/Variants/VariantPicker'
import WishlistButton from '../../components/WishlistButton/WishlistButton'
import { useCart } from '../../context/CartContext'
import useRecentlyViewed from '../../hooks/useRecentlyViewed'
import useStoreInfo from '../../hooks/useStoreInfo'
import { productService } from '../../services/productService'
import { cn, formatNaira } from '../../utils/format'
import Gallery from './Gallery'
import Reviews from './Reviews'

const TABS = [
  { key: 'description', label: 'Description' },
  { key: 'specifications', label: 'Specifications' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'shipping', label: 'Shipping Information' },
]

function Availability({ product, variant }) {
  const stock = variant ? variant.stock_quantity : product.stock_quantity
  if (stock <= 0) return <span className="chip bg-metal-200 text-metal-600">Out of stock</span>
  if (product.availability === 'low_stock' || stock <= 5) return <span className="chip bg-warning text-white">Only {stock} left</span>
  return <span className="chip bg-emerald-50 text-emerald-700">In stock</span>
}

/** Jumia-style assurance panel: hairline-separated rows of purchase promises. */
function AssurancePanel() {
  const { company } = useStoreInfo()
  const rows = [
    { icon: Truck, title: 'Nationwide delivery', text: 'Delivered to all 36 states.' },
    { icon: Store, title: 'Free store pickup', text: `Collect in ${company.locations.map((l) => l.label).join(' or ')}, Ikeja.` },
    { icon: CreditCard, title: 'Secure payment', text: 'Card, transfer or USSD via Paystack.' },
  ]
  return (
    <ul className="mt-6 divide-y divide-line overflow-hidden rounded-md border border-line">
      {rows.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-start gap-3 px-4 py-3">
          <Icon className="mt-0.5 h-4 w-4 flex-none text-brand-600" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-ink-900">{title}</span>
            <span className="block text-xs text-metal-500">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function ShippingInfo() {
  const { shipping, company } = useStoreInfo()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { icon: Truck, title: 'Lagos delivery', text: shipping ? `${formatNaira(shipping.lagos)} flat rate within Lagos. Most orders arrive within 1–2 business days.` : 'Fast delivery within Lagos.' },
        { icon: Truck, title: 'Nationwide shipping', text: shipping ? `${formatNaira(shipping.south_west)} to other South-West states and ${formatNaira(shipping.default)} elsewhere in Nigeria. Typically 2–5 business days.` : 'Delivery to every state.' },
        { icon: Store, title: 'Free store pickup', text: `Collect from our ${company.locations.map((l) => l.label.toLowerCase()).join(' or ')} in Computer Village, Ikeja once your order is ready.` },
        { icon: Zap, title: 'Free delivery on big orders', text: shipping ? `Orders from ${formatNaira(shipping.free_shipping_threshold)} ship free.` : 'Free delivery on qualifying orders.' },
      ].map(({ icon: Icon, title, text }) => (
        <div key={title} className="rounded-md border border-line bg-white p-4">
          <Icon className="h-4.5 w-4.5 text-brand-600" strokeWidth={1.75} />
          <p className="mt-2.5 text-[13px] font-semibold text-ink-900">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-metal-500">{text}</p>
        </div>
      ))}
      <p className="text-xs text-metal-400 sm:col-span-2">Delivery fees are calculated by our server at checkout based on your state. See our shipping and returns pages for full details.</p>
    </div>
  )
}

function RecentlyViewed({ slugs, current }) {
  const list = slugs.filter((s) => s !== current).slice(0, 4)
  const { data = [] } = useQuery({ queryKey: ['products', 'recent', list], queryFn: () => productService.bySlugs(list), enabled: list.length > 0 })
  if (!list.length || !data.length) return null
  const ordered = list.map((s) => data.find((p) => p.slug === s)).filter(Boolean)
  return (
    <section className="container mt-20">
      <SectionHeading eyebrow="Your history" title="Recently viewed" />
      <ProductGrid products={ordered} />
    </section>
  )
}

export default function ProductDetails() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { addItem, pending } = useCart()
  const { slugs: recent, track } = useRecentlyViewed()
  const [recentSnapshot] = useState(recent)
  const [variant, setVariant] = useState(null)
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState('description')
  const [buying, setBuying] = useState(false)

  const { data: product, isLoading, isError, error, refetch } = useQuery({ queryKey: ['product', slug], queryFn: () => productService.detail(slug) })
  const related = useQuery({ queryKey: ['related', slug], queryFn: () => productService.related(slug), enabled: Boolean(product) })

  useEffect(() => {
    if (!product) return
    track(product.slug)
    setVariant(product.variants?.find((v) => v.in_stock) || product.variants?.[0] || null)
    setQty(1)
  }, [product, track])

  const jsonLd = useMemo(
    () =>
      product && {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        sku: product.sku,
        image: product.images?.map((i) => i.image),
        description: product.short_description || product.description,
        brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
        aggregateRating: product.review_count ? { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: product.review_count } : undefined,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NGN',
          price: product.current_price,
          availability: product.availability === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'Timeline Global Systems Limited' },
        },
      },
    [product],
  )

  if (isLoading) return <ProductDetailsSkeleton />
  if (isError) {
    if (error?.response?.status === 404) {
      return (
        <EmptyState
          icon={PackageX}
          title="Product not found"
          message="This product may have been removed or the link is incorrect."
          action={{ label: 'Browse products', to: '/shop' }}
          secondary={{ label: 'Go home', to: '/' }}
          className="py-28"
        />
      )
    }
    return <ErrorState onRetry={refetch} className="py-28" />
  }

  const stock = variant ? variant.stock_quantity : product.stock_quantity
  const soldOut = stock <= 0
  const unitPrice = variant ? Number(variant.price) : Number(product.current_price)
  const compareAt = product.discount_price ? Number(product.price) + (variant ? Number(variant.price_adjustment) : 0) : null
  const crumbs = [{ label: 'Shop', to: '/shop' }, ...(product.breadcrumbs || []).map((c) => ({ label: c.name, to: `/category/${c.slug}` })), { label: product.name }]

  const add = () => addItem(product, qty, variant).catch(() => {})
  const buyNow = async () => {
    setBuying(true)
    try {
      await addItem(product, qty, variant, { silent: true })
      navigate('/checkout')
    } catch {
      /* toast already shown */
    } finally {
      setBuying(false)
    }
  }

  const specs = Object.entries(product.specifications || {})

  return (
    <>
      <Seo
        title={product.meta_title?.replace(' | Timeline Gadgets', '') || product.name}
        description={product.meta_description || product.short_description}
        image={product.images?.[0]?.image}
        type="product"
        jsonLd={jsonLd}
      />

      <div className="container py-6 pb-24 sm:py-8 sm:pb-0">
        <Breadcrumbs items={crumbs} />

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
          <Gallery product={product} />

          <div>
            {product.brand && (
              <Link to={`/brands/${product.brand.slug}`} className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 hover:text-brand-700">
                {product.brand.name}
              </Link>
            )}
            <h1 className="mt-2 text-[22px] font-semibold leading-snug tracking-tight sm:text-2xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <button type="button" onClick={() => (setTab('reviews'), document.getElementById('product-tabs')?.scrollIntoView({ behavior: 'smooth' }))}>
                <Rating value={product.rating} count={`${product.review_count} review${product.review_count === 1 ? '' : 's'}`} showValue />
              </button>
              <span className="text-metal-300">|</span>
              <span className="text-xs text-metal-500">
                SKU: <span className="break-all font-mono">{variant?.sku || product.sku}</span>
              </span>
            </div>

            {/* Jumia-style price block */}
            <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1.5">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={unitPrice}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  className="text-[32px] font-bold leading-none tracking-tight text-ink-900"
                >
                  {formatNaira(unitPrice)}
                </motion.span>
              </AnimatePresence>
              {compareAt && <span className="pb-0.5 text-base text-metal-400 line-through">{formatNaira(compareAt)}</span>}
              {product.discount_percent > 0 && <span className="chip mb-1 bg-danger text-white">Save {product.discount_percent}%</span>}
            </div>
            <div className="mt-3">
              <Availability product={product} variant={variant} />
            </div>

            {product.short_description && <p className="mt-5 text-[15px] leading-relaxed text-metal-600">{product.short_description}</p>}

            <div className="mt-6 space-y-4 border-t border-line pt-6">
              <VariantPicker variants={product.variants} value={variant} onChange={(v) => (setVariant(v), setQty(1))} />
              <div className="flex flex-wrap items-stretch gap-2.5">
                <QuantitySelector value={qty} onChange={setQty} max={Math.max(1, Math.min(stock, 20))} disabled={soldOut} />
                <Button size="lg" icon={ShoppingBag} className="min-w-[200px] flex-1" onClick={add} loading={pending === product.id && !buying} disabled={soldOut}>
                  {soldOut ? 'Out of stock' : 'Add to cart'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button size="lg" variant="accent" className="flex-1" onClick={buyNow} loading={buying} disabled={soldOut} icon={Zap}>
                  Buy now
                </Button>
                <WishlistButton product={product} withLabel className="flex-1 justify-center" />
              </div>
            </div>

            <AssurancePanel />
            {product.warranty && (
              <p className="mt-4 flex items-center gap-2 text-[13px] text-metal-500">
                <RotateCcw className="h-4 w-4 flex-none" strokeWidth={1.75} /> {product.warranty}
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <section id="product-tabs" className="mt-16 scroll-mt-24 sm:mt-20">
          <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn('relative whitespace-nowrap px-4 py-3 text-[13px] font-semibold transition-colors', tab === t.key ? 'text-ink-900' : 'text-metal-500 hover:text-ink-900')}
              >
                {t.label}
                {t.key === 'reviews' && ` (${product.review_count})`}
                {tab === t.key && <motion.span layoutId="pd-tab" className="absolute inset-x-2 bottom-0 h-0.5 bg-brand-600" />}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="py-8" role="tabpanel">
              {tab === 'description' && (
                <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-metal-600">
                  {(product.description || product.short_description || 'Details coming soon.').split('\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              )}
              {tab === 'specifications' &&
                (specs.length ? (
                  <dl className="max-w-3xl divide-y divide-line overflow-hidden rounded-md border border-line">
                    {specs.map(([k, v], i) => (
                      <div key={k} className={cn('grid grid-cols-[130px_1fr] gap-4 px-4 py-3 text-[13px] sm:grid-cols-[200px_1fr]', i % 2 === 0 && 'bg-metal-50')}>
                        <dt className="font-medium text-metal-500">{k}</dt>
                        <dd className="text-ink-900">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-metal-500">Specifications will be added soon.</p>
                ))}
              {tab === 'reviews' && <Reviews product={product} />}
              {tab === 'shipping' && <ShippingInfo />}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      {related.data?.length ? (
        <ProductCarousel
          title="You may also like"
          subtitle="Related products customers viewed together"
          viewAllTo={`/category/${product.category?.slug || ''}`}
          viewAllLabel="View category"
          products={related.data.slice(0, 10)}
          columns={5}
        />
      ) : null}

      <RecentlyViewed slugs={recentSnapshot} current={product.slug} />

      {/* Sticky mobile purchase bar. Flush to the viewport edge: there is no
          fixed bottom tab bar, so nothing needs clearing underneath it. */}
      <Reveal
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 pb-safe sm:hidden"
        y={40}
      >

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-metal-500">{product.name}</p>
            <p className="font-bold">{formatNaira(unitPrice)}</p>
          </div>
          <Button onClick={add} disabled={soldOut} loading={pending === product.id} icon={ShoppingBag} className="px-4">
            {soldOut ? 'Sold out' : 'Add'}
          </Button>
        </div>
      </Reveal>
    </>
  )
}
