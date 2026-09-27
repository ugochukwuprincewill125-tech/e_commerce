import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, ShieldCheck, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { productService } from '../../services/productService'
import { cn, formatNaira } from '../../utils/format'

const SLIDES = [
  {
    eyebrow: 'Work · Study · Create',
    title: 'Laptops and computer systems',
    body: 'Everyday productivity machines, workstations and complete desktop setups from established brands.',
    cta: { to: '/category/laptops', label: 'Shop laptops' },
    plate: 'bg-ink-950',
  },
  {
    eyebrow: 'Power & charging',
    title: 'Chargers, cables and power banks',
    body: 'Reliable charging solutions for phones, laptops and other devices, with trade-in options in store.',
    cta: { to: '/category/phone-accessories', label: 'Shop accessories' },
    plate: 'bg-brand-700',
  },
  {
    eyebrow: 'Audio & wearables',
    title: 'Headphones, earbuds and smart devices',
    body: 'Everyday audio, smart watches and connected devices from the brands we stock.',
    cta: { to: '/shop', label: 'Browse all products' },
    plate: 'bg-ink-900',
  },
]

const ASSURANCES = [
  { icon: Truck, term: 'Nationwide delivery', desc: 'Lagos and all 36 states' },
  { icon: ShieldCheck, term: 'Secure payments', desc: 'Processed via Paystack' },
  { icon: MapPin, term: 'Store collection', desc: 'Two locations in Ikeja' },
]

const INTERVAL = 7000

/**
 * Jumia-style campaign slider: full-bleed solid plates with a heading, a single
 * call to action and a dot/arrow control. No gradients, no overlays.
 */
export default function Hero() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const { data } = useQuery({
    queryKey: ['products', 'hero'],
    queryFn: () => productService.list({ featured: true, page_size: 3, ordering: '-effective_price' }),
    staleTime: 300_000,
  })
  const picks = (data?.results || []).slice(0, 3)

  useEffect(() => {
    if (paused) return undefined
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL)
    return () => clearInterval(t)
  }, [paused])

  const slide = SLIDES[index]

  return (
    <section
      className="bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
    >
      <div className={cn('relative overflow-hidden text-white', slide.plate)}>
        <div className="container grid min-h-[380px] items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <p className="eyebrow-plain text-brand-300">{slide.eyebrow}</p>
              <h1 className="mt-4 max-w-2xl text-display-sm sm:text-display">{slide.title}</h1>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-white/70">{slide.body}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button to={slide.cta.to} variant="accent" size="lg" iconRight={ArrowRight}>
                  {slide.cta.label}
                </Button>
                <Button to="/categories" variant="inverse" size="lg">
                  All categories
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Live featured stock panel */}
          <div className="overflow-hidden rounded-md bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-900">Featured products</h2>
              <Link to="/shop" className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                View all
              </Link>
            </div>

            {picks.length === 0 ? (
              <ul className="divide-y divide-line">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-12 w-12 flex-none animate-pulse rounded bg-metal-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-16 animate-pulse rounded bg-metal-100" />
                      <div className="h-3 w-32 animate-pulse rounded bg-metal-100" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-line">
                {picks.map((p) => (
                  <li key={p.id}>
                    <Link to={`/products/${p.slug}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-metal-50">
                      <div className="h-12 w-12 flex-none rounded border border-line p-1">
                        {p.image && <img src={p.image} alt="" className="h-full w-full object-contain" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        {p.brand?.name && <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-metal-400">{p.brand.name}</p>}
                        <p className="truncate text-[13px] font-medium text-ink-900">{p.name}</p>
                        <p className="text-[13px] font-bold text-ink-900">{formatNaira(p.current_price)}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 flex-none text-metal-300 transition-colors group-hover:text-ink-900" strokeWidth={1.75} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 border-t border-line bg-metal-50 px-4 py-2.5 text-[11px] text-metal-600">
              <MapPin className="h-3.5 w-3.5 flex-none text-ink-800" strokeWidth={1.75} aria-hidden />
              Collect in store at Oremeji &amp; Otigba Streets
            </div>
          </div>
        </div>

        {/* Slider controls */}
        <div className="container flex items-center justify-between pb-5">
          <div className="flex items-center gap-2" role="tablist" aria-label="Promotion slides">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1}: ${s.title}`}
                onClick={() => setIndex(i)}
                className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-7 bg-white' : 'w-3 bg-white/35 hover:bg-white/60')}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
              aria-label="Previous slide"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 text-white transition-colors hover:bg-white hover:text-ink-900"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
              aria-label="Next slide"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 text-white transition-colors hover:bg-white hover:text-ink-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Purchase reassurance band */}
      <div className="border-b border-line bg-white">
        <div className="container grid gap-5 py-6 sm:grid-cols-3">
          {ASSURANCES.map(({ icon: Icon, term, desc }) => (
            <div key={term} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4.5 w-4.5 flex-none text-brand-600" strokeWidth={1.75} aria-hidden />
              <span>
                <span className="block text-[13px] font-semibold text-ink-900">{term}</span>
                <span className="mt-0.5 block text-xs text-metal-500">{desc}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
