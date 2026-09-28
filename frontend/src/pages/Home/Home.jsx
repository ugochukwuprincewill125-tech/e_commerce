import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Headphones, MapPin, Package, ShieldCheck, Store, Truck, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import ProductCarousel from '../../components/Carousel/ProductCarousel'
import { ErrorState } from '../../components/EmptyState/EmptyState'
import InstagramIcon from '../../components/Icons/InstagramIcon'
import Reveal from '../../components/Motion/Reveal'
import Seo from '../../components/Seo/Seo'
import useStoreInfo from '../../hooks/useStoreInfo'
import { catalogService, productService } from '../../services/productService'
import { cn } from '../../utils/format'
import Hero from './Hero'

function BrandStrip() {
  const { data = [] } = useQuery({ queryKey: ['brands'], queryFn: () => catalogService.brands() })
  if (!data.length) return null
  return (
    <section className="border-b border-line bg-white py-7">
      <div className="container flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <h2 className="eyebrow-plain flex-none">Brands stocked</h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4 lg:flex lg:flex-wrap lg:items-center lg:gap-x-7">
          {data.map((b) => (
            <li key={b.slug}>
              <Link to={`/brands/${b.slug}`} className="font-display text-sm font-semibold tracking-tight text-metal-600 transition-colors hover:text-brand-700">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/brands" className="flex-none text-[13px] font-semibold text-brand-700 transition-colors hover:text-brand-800 lg:ml-auto">
          All brands →
        </Link>
      </div>
    </section>
  )
}

function PromoStrip() {
  const banners = [
    {
      to: '/category/laptops',
      eyebrow: 'Computers',
      title: 'Laptops & desktop systems',
      text: 'Productivity machines, workstations and full setups.',
      cta: 'Shop computers',
      plate: 'bg-ink-950',
    },
    {
      to: '/category/phone-accessories',
      eyebrow: 'Accessories',
      title: 'Chargers, cables & power banks',
      text: 'Reliable charging for every device you own.',
      cta: 'Shop accessories',
      plate: 'bg-brand-700',
    },
    {
      to: '/shop?on_sale=true',
      eyebrow: 'Offers',
      title: 'Reduced prices this week',
      text: 'Discounted stock while quantities last.',
      cta: 'View discounts',
      plate: 'bg-ink-900',
    },
  ]
  return (
    <section className="border-b border-line bg-white py-8">
      <div className="container grid gap-3 md:grid-cols-3">
        {banners.map(({ to, eyebrow, title, text, cta, plate }, i) => (
          <Reveal key={to} delay={i * 0.05}>
            <Link to={to} className={cn('group flex h-full min-h-[164px] flex-col justify-between rounded-md p-6 text-white transition-colors', plate)}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-300">{eyebrow}</p>
              <div>
                <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-white">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 border-t border-white/20 pt-3 text-[13px] font-semibold">
                  {cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

const COLLECTIONS = [
  { key: 'featured', title: 'Featured products', subtitle: 'Hand-picked by our team', to: '/shop?featured=true', params: { featured: true } },
  { key: 'bestseller', title: 'Best sellers', subtitle: 'What customers buy most', to: '/shop?bestseller=true', params: { bestseller: true } },
  { key: 'new_arrival', title: 'New arrivals', subtitle: 'Recently added stock', to: '/shop?new_arrival=true', params: { new_arrival: true } },
]

function CollectionCarousels() {
  return (
    <>
      {COLLECTIONS.map((c) => (
        <CollectionRow key={c.key} {...c} />
      ))}
    </>
  )
}

function CollectionRow({ key: queryKey, title, subtitle, to, params }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'home-row', queryKey],
    queryFn: () => productService.list({ ...params, page_size: 12 }),
  })
  const results = data?.results || []
  if (isError) return <ErrorState title="Unable to load products" onRetry={refetch} className="container" />
  if (!isLoading && !results.length) return null
  return <ProductCarousel title={title} subtitle={subtitle} viewAllTo={to} products={results} loading={isLoading} columns={5} />
}

function DealsRow() {
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'deals'],
    queryFn: () => productService.list({ on_sale: true, in_stock: true, min_discount: 8, page_size: 12, ordering: '-review_count' }),
  })
  const results = data?.results || []
  if (!isLoading && !results.length) return null
  return <ProductCarousel title="Deals & discounted products" subtitle="Reduced prices while stocks last" viewAllTo="/shop?on_sale=true" products={results} loading={isLoading} columns={5} />
}

const VALUES = [
  { icon: Package, title: 'Quality stock', text: 'Phones, computers and electronics selected for performance and reliability.' },
  { icon: Headphones, title: 'Accessories', text: 'Chargers, cables, audio, storage and networking — the essentials in one place.' },
  { icon: Wallet, title: 'Competitive pricing', text: 'Fair Computer Village prices, with clear totals calculated before you pay.' },
  { icon: Truck, title: 'Nationwide delivery', text: 'Reliable shipping to Lagos and every state in Nigeria.' },
  { icon: Store, title: 'Physical locations', text: 'Visit our main office and branch in Computer Village, Ikeja.' },
  { icon: ShieldCheck, title: 'Customer service', text: 'Guidance before and after purchase from a team that knows its products.' },
]

function WhyTimeline() {
  return (
    <section className="border-b border-line bg-metal-50 py-12 sm:py-16">
      <div className="container">
        <div className="mb-8 border-b border-line pb-4">
          <p className="eyebrow mb-2">About us</p>
          <h2 className="text-section-title">A gadget retailer built on trust</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-metal-500">
            Timeline Global Systems Limited serves individuals, students and businesses from Computer Village — Lagos'
            technology hub.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.03}>
              <div className="h-full bg-white p-5">
                <Icon className="h-5 w-5 text-brand-600" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-3.5 text-[15px] font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-metal-500">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function VisitUs() {
  const { company } = useStoreInfo()
  return (
    <section className="border-b border-line bg-white py-12 sm:py-16">
      <div className="container grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal className="flex flex-col justify-center">
          <p className="eyebrow mb-3">Visit us</p>
          <h2 className="text-section-title">Two stores in Computer Village, Ikeja</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-metal-500">
            View products in person, speak with our team for advice, or collect your online order from either location.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button to="/contact#locations" icon={MapPin}>
              Get directions
            </Button>
            <Button href={company.instagram} target="_blank" rel="noopener noreferrer" variant="outline" icon={InstagramIcon}>
              {company.instagram_handle}
            </Button>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          {company.locations.map((loc, i) => (
            <Reveal key={loc.id} delay={i * 0.05}>
              <div className="flex h-full flex-col rounded-md border border-line bg-white p-5">
                <span className="chip self-start bg-ink-900 text-white">{loc.label}</span>
                <address className="mt-3.5 flex-1 text-sm not-italic leading-6 text-ink-800">
                  {loc.lines.map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                </address>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.map_query)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 border-t border-line pt-3 text-[13px] font-semibold text-brand-700 transition-colors hover:text-brand-800"
                >
                  Open in Google Maps <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Seo />
      <Hero />
      <PromoStrip />
      <div className="bg-white">
        <CollectionCarousels />
        <DealsRow />
      </div>
      <WhyTimeline />
      <VisitUs />
      <section className="bg-white py-10">
        <div className="container">
          <Reveal className="flex flex-col items-center gap-3 rounded-md border border-line bg-metal-50 px-6 py-8 text-center">
            <InstagramIcon className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold">Follow Timeline Gadgets</h2>
            <p className="max-w-lg text-sm text-metal-500">
              New arrivals, restocks and in-store offers are posted to our Instagram account.
            </p>
            <Button href="https://www.instagram.com/timelinegadgets/" target="_blank" rel="noopener noreferrer" variant="outline" icon={InstagramIcon}>
              @timelinegadgets
            </Button>
          </Reveal>
        </div>
      </section>
    </>
  )
}
