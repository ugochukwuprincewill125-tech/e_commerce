import { useQuery } from '@tanstack/react-query'
import { ArrowRight, LayoutGrid, MapPin, ShieldCheck, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { productService } from '../../services/productService'
import { cn, formatNaira } from '../../utils/format'

/** Purchase assurances shown under the hero copy. */
const ASSURANCES = [
  { icon: MapPin, label: '2 stores in Computer Village' },
  { icon: Truck, label: 'Nationwide delivery' },
  { icon: ShieldCheck, label: 'Secure checkout' },
]

/**
 * Where each live product card lands in the cluster. The centre card sits on
 * top and square; the flanking cards tilt away and tuck in behind it.
 */
const CARD_SLOTS = [
  'absolute left-0 top-24 w-[178px] -rotate-[10deg]',
  'absolute left-1/2 top-8 z-10 w-[218px] -translate-x-1/2',
  'absolute right-0 top-36 w-[188px] rotate-[10deg]',
]

function HeroCard({ product, className }) {
  // Placeholder keeps the cluster's shape while stock loads instead of
  // collapsing the hero.
  if (!product) {
    return (
      <div className={cn('rounded-2xl border border-white/10 bg-ink-800/80 p-3', className)} aria-hidden>
        <div className="aspect-square animate-pulse rounded-xl bg-white/10" />
        <div className="space-y-2 px-1.5 pb-0.5 pt-3">
          <div className="h-2.5 w-12 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    )
  }

  return (
    <Link
      to={`/products/${product.slug}`}
      className={cn(
        'group block rounded-2xl border border-white/10 bg-ink-800/80 p-3 shadow-overlay transition-transform duration-200 hover:-translate-y-1',
        className,
      )}
    >
      <span className="block aspect-square rounded-xl bg-gradient-to-br from-white via-white to-metal-200 p-5">
        {product.image ? (
          <img
            src={product.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="block h-full w-full animate-pulse rounded bg-metal-100" />
        )}
      </span>
      <span className="block px-1.5 pb-0.5 pt-3">
        {product.brand?.name && (
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-metal-400">{product.brand.name}</span>
        )}
        <span className="block truncate text-[13px] font-semibold text-white">{product.name}</span>
        <span className="mt-0.5 block text-[13px] font-bold text-brand-400">{formatNaira(product.current_price)}</span>
      </span>
    </Link>
  )
}

/**
 * Landing hero. A single dark plate: campaign copy and purchase assurances on
 * the left, live product cards floating on the right, both over a faint
 * technical grid. There is no video and no slide rotation.
 */
export default function Hero() {
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'hero-recent'],
    queryFn: () => productService.list({ page_size: 3, ordering: '-created_at' }),
    staleTime: 300_000,
  })

  const picks = (data?.results || []).slice(0, 3)
  // Placeholder cards while the query is in flight; the real rows once it
  // settles. An empty catalogue hides the cluster rather than leaving three
  // skeleton cards pulsing forever.
  const cards = isLoading ? [null, null, null] : picks
  const showCluster = isLoading || picks.length > 0

  return (
    <section className="relative overflow-hidden bg-ink-950 text-white">
      {/* Faint technical grid — depth without a photo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      {/* Brand glow behind the product cards. */}
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-32 h-[560px] w-[560px] rounded-full bg-brand-600/25 blur-[140px]" />

      <div className="relative container grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-metal-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden />
            Timeline Global Systems — Home of Quality Gadgets
          </span>

          <h1 className="mt-6 max-w-xl text-display-sm text-white sm:text-display">
            Technology That Fits Your <span className="text-brand-400">World.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-metal-300">
            Discover quality gadgets, accessories and technology solutions at competitive prices — from our stores in
            Computer Village, Ikeja to your doorstep anywhere in Nigeria.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/shop" variant="accent" size="lg" iconRight={ArrowRight}>
              Shop Now
            </Button>
            <Button to="/categories" variant="inverse" size="lg" icon={LayoutGrid}>
              Explore Categories
            </Button>
          </div>

          <div className="mt-10 grid max-w-lg gap-6 border-t border-white/10 pt-6 sm:grid-cols-3">
            {ASSURANCES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col gap-2">
                <Icon className="h-[18px] w-[18px] text-brand-400" strokeWidth={1.75} aria-hidden />
                <span className="text-[13px] font-medium text-metal-300">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating stock — the freshest catalogue rows. Hidden on small
            screens, where the same products appear in the carousels directly
            below. */}
        {showCluster && (
          <div className="relative hidden lg:block">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06]" />
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04]" />

            <div className="relative mx-auto h-[440px] w-full max-w-[540px]">
              <div className="absolute right-2 top-0 z-20 rounded-xl border border-white/10 bg-ink-800/95 px-3.5 py-2.5 shadow-overlay backdrop-blur">
                <p className="text-xs font-semibold text-white">Pickup available</p>
                <p className="text-[11px] text-metal-400">Oremeji &amp; Otigba St.</p>
              </div>

              {CARD_SLOTS.map((slot, i) => (
                <HeroCard key={cards[i]?.id ?? i} product={cards[i]} className={slot} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
