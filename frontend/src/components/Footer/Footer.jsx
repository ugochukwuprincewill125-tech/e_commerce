import { ArrowUp, Clock, CreditCard, Mail, MapPin, ShieldCheck, Store, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'

import useStoreInfo from '../../hooks/useStoreInfo'
import InstagramIcon from '../Icons/InstagramIcon'
import Logo from '../Logo/Logo'

const COLUMNS = [
  {
    title: 'Customer Service',
    links: [
      { to: '/contact', label: 'Help Centre' },
      { to: '/contact', label: 'Contact Us' },
      { to: '/track-order', label: 'Track Order' },
      { to: '/returns', label: 'Returns & Refunds' },
      { to: '/shipping', label: 'Shipping Information' },
      { to: '/faqs', label: 'FAQs' },
    ],
  },
  {
    title: 'Shop With Us',
    links: [
      { to: '/account', label: 'My Account' },
      { to: '/account/orders', label: 'My Orders' },
      { to: '/account/wishlist', label: 'My Wishlist' },
      { to: '/cart', label: 'My Cart' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About Us' },
      { to: '/contact#locations', label: 'Our Locations' },
      { to: '/brands', label: 'Brands' },
      { to: '/categories', label: 'All Categories' },
    ],
  },
  {
    title: 'Make Money',
    links: [
      { to: '/contact', label: 'Sell to Timeline' },
      { to: '/contact', label: 'Bulk & Corporate Orders' },
      { to: '/contact', label: 'Partnerships' },
    ],
  },
]

const PAYMENTS = [
  { label: 'Card', Icon: CreditCard },
  { label: 'Bank transfer', Icon: Store },
  { label: 'Paystack', Icon: ShieldCheck },
]

/**
 * Jumia-style footer: a back-to-top bar, dense link columns, payment methods,
 * store details and legal line. Flat ink surface, hairline rules only.
 */
export default function Footer() {
  const { company } = useStoreInfo()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-14 bg-ink-950 text-metal-400">
      {/* Back to top bar */}
      <div className="border-b border-white/10">
        <div className="container flex h-12 items-center justify-between">
          <p className="text-[13px] font-medium text-white">Home of Quality Gadgets</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1.5 text-[13px] font-medium text-metal-400 transition-colors hover:text-white"
          >
            Back to top
            <ArrowUp className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="container py-12">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white">{col.title}</h3>
                <ul className="mt-4 space-y-2.5 text-[13px]">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link to={l.to} className="transition-colors hover:text-white">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Store details */}
          <div className="lg:col-span-4">
            <Logo onDark size="lg" />
            <div className="mt-6 space-y-2.5 text-[13px]">
              <p className="font-semibold text-white">{company.name}</p>
              <a href={`mailto:${company.email}`} className="flex items-center gap-2.5 transition-colors hover:text-white">
                <Mail className="h-4 w-4 flex-none text-metal-500" strokeWidth={1.75} /> {company.email}
              </a>
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-none text-metal-500" strokeWidth={1.75} /> Computer Village, Ikeja, Lagos.
              </p>
              {company.phones?.map((phone) => (
                <a key={phone} href={`tel:${phone.replace(/\s/g, '')}`} className="block transition-colors hover:text-white">
                  {phone}
                </a>
              ))}
            </div>

            <a
              href={company.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:border-white hover:bg-white hover:text-ink-900"
            >
              <InstagramIcon className="h-4 w-4" /> {company.instagram_handle}
            </a>
          </div>
        </div>

        {/* Service band */}
        <div className="mt-10 grid grid-cols-2 gap-6 border-t border-white/10 pt-8 lg:grid-cols-4">
          {[
            { Icon: Truck, title: 'Nationwide delivery', text: 'Lagos & all 36 states' },
            { Icon: ShieldCheck, title: 'Quality gadgets', text: 'Carefully selected stock' },
            { Icon: CreditCard, title: 'Secure payments', text: 'Processed via Paystack' },
            { Icon: Clock, title: 'Real support', text: 'Talk to our team' },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 flex-none text-brand-400" strokeWidth={1.75} aria-hidden />
              <span>
                <span className="block text-[13px] font-semibold text-white">{title}</span>
                <span className="mt-0.5 block text-xs text-metal-500">{text}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Payment methods */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-8">
          <span className="eyebrow-plain text-metal-500">We accept</span>
          {PAYMENTS.map(({ label, Icon }) => (
            <span key={label} className="flex items-center gap-1.5 rounded border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-metal-300">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-2 py-5 text-xs text-metal-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {company.name}. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-4">
            <li>
              <Link to="/shipping" className="transition-colors hover:text-white">
                Shipping
              </Link>
            </li>
            <li>
              <Link to="/returns" className="transition-colors hover:text-white">
                Returns
              </Link>
            </li>
            <li>
              <Link to="/faqs" className="transition-colors hover:text-white">
                FAQs
              </Link>
            </li>
            <li>Computer Village, Ikeja, Lagos</li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
