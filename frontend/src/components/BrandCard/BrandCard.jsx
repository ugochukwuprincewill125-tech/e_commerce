import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Brands are shown as typographic cards. Upload approved brand logos in the
 * Django admin (Brands -> logo) if you have permission to display them.
 */
export default function BrandCard({ brand }) {
  return (
    <Link
      to={`/brands/${brand.slug}`}
      className="group flex h-full flex-col rounded-lg border border-line bg-white p-5 transition-colors hover:border-ink-900"
    >
      <div className="flex h-12 items-center border-b border-line pb-4">
        <span className="font-display text-lg font-semibold tracking-tight text-ink-900">{brand.name}</span>
      </div>
      {brand.description && <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-metal-500">{brand.description}</p>}
      <div className="mt-auto flex items-center justify-between pt-5 text-[13px]">
        <span className="text-metal-400">{brand.product_count} products</span>
        <span className="flex items-center gap-1.5 font-semibold text-ink-900">
          Shop <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
