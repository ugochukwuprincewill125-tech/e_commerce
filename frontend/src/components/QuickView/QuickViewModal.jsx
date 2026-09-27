import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useCart } from '../../context/CartContext'
import { productService } from '../../services/productService'
import { formatNaira } from '../../utils/format'
import Button from '../Button/Button'
import { Skeleton } from '../Loader/Skeleton'
import Modal from '../Modal/Modal'
import { ProductBadges } from '../ProductCard/ProductCard'
import QuantitySelector from '../QuantitySelector/QuantitySelector'
import Rating from '../Rating/Rating'
import VariantPicker from '../Variants/VariantPicker'
import WishlistButton from '../WishlistButton/WishlistButton'

export default function QuickViewModal({ slug, preview, onClose }) {
  const { addItem, pending } = useCart()
  const [variant, setVariant] = useState(null)
  const [qty, setQty] = useState(1)
  const [active, setActive] = useState(0)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productService.detail(slug),
    enabled: Boolean(slug),
  })

  useEffect(() => {
    setQty(1)
    setActive(0)
    setVariant(product?.variants?.find((v) => v.in_stock) || null)
  }, [product])

  const p = product || preview
  const soldOut = product ? product.availability === 'out_of_stock' : false
  const price = variant ? Number(variant.price) : Number(p?.current_price || 0)
  const maxQty = Math.max(1, Math.min(variant ? variant.stock_quantity : product?.stock_quantity || 1, 10))
  const images = product?.images?.length ? product.images.map((i) => i.image) : [p?.image].filter(Boolean)

  return (
    <Modal open={Boolean(slug)} onClose={onClose} title={p?.name || 'Quick view'} hideTitle size="max-w-4xl">
      {p && (
        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-2">
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-metal-50">
              {images[active] && <img src={images[active]} alt={p.name} className="h-full w-full object-cover" />}
              <ProductBadges product={p} className="absolute left-3 top-3" />
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActive(i)}
                    className={`h-16 w-16 overflow-hidden rounded-xl border-2 ${i === active ? 'border-ink-900' : 'border-transparent'}`}
                    aria-label={`View image ${i + 1}`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            {p.brand && <p className="text-xs font-semibold uppercase tracking-wider text-metal-400">{p.brand.name}</p>}
            <h2 className="mt-1 pr-8 text-xl font-bold sm:text-2xl">{p.name}</h2>
            {Number(p.review_count) > 0 && <Rating value={p.rating} count={p.review_count} className="mt-2" />}
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-2xl font-bold">{formatNaira(price)}</span>
              {p.discount_price && !variant && <span className="text-sm text-metal-400 line-through">{formatNaira(p.price)}</span>}
            </div>
            {p.short_description && <p className="mt-3 text-sm leading-relaxed text-metal-500">{p.short_description}</p>}
            {isLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <VariantPicker variants={product?.variants} value={variant} onChange={setVariant} />
                {!soldOut && <QuantitySelector value={qty} onChange={setQty} max={maxQty} />}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <Button
                className="flex-1"
                variant="primary"
                size="lg"
                icon={ShoppingBag}
                loading={pending === p.id}
                disabled={soldOut || isLoading}
                onClick={() => addItem(product, qty, variant, { openDrawer: true }).then(onClose).catch(() => {})}
              >
                {soldOut ? 'Sold out' : 'Add to cart'}
              </Button>
              <WishlistButton product={p} className="h-[52px] w-[52px] border border-metal-200" />
            </div>
            <Link to={`/products/${p.slug}`} onClick={onClose} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              View full details <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      )}
    </Modal>
  )
}
