import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { useState } from 'react'

import { ProductBadges } from '../../components/ProductCard/ProductCard'
import Modal from '../../components/Modal/Modal'
import { cn } from '../../utils/format'

/** Product gallery with thumbnails, hover zoom (desktop), swipe (mobile) and a fullscreen viewer. */
export default function Gallery({ product }) {
  const images = product.images?.length ? product.images : [{ id: 0, image: product.image, alt_text: product.name }].filter((i) => i.image)
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [lightbox, setLightbox] = useState(false)
  const current = images[index]

  const move = (dir) => setIndex((i) => (i + dir + images.length) % images.length)

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setZoom({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 })
  }

  if (!images.length) {
    return <div className="flex aspect-square items-center justify-center rounded-lg bg-metal-50 text-sm text-metal-400">Image coming soon</div>
  }

  return (
    <div className="pinned-panel">
      <div
        className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg bg-metal-50"
        onMouseMove={onMove}
        onMouseLeave={() => setZoom(null)}
        onClick={() => setLightbox(true)}
        role="button"
        tabIndex={0}
        aria-label="Open image viewer"
        onKeyDown={(e) => e.key === 'Enter' && setLightbox(true)}
      >
        <div
          className="h-full w-full transition-transform duration-200 ease-out"
          style={zoom ? { transform: 'scale(1.9)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        >
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={current.id}
            src={current.image}
            alt={current.alt_text || product.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            drag={images.length > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) move(1)
              else if (info.offset.x > 60) move(-1)
            }}
            className="h-full w-full select-none object-cover"
            draggable={false}
          />
        </AnimatePresence>
        </div>
        <ProductBadges product={product} className="absolute left-4 top-4" />
        <span className="absolute bottom-4 right-4 hidden items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition group-hover:opacity-0 md:flex">
          <ZoomIn className="h-3.5 w-3.5" /> Hover to zoom
        </span>
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 md:hidden">
            {images.map((img, i) => (
              <span key={img.id} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-ink-900' : 'w-1.5 bg-ink-900/25')} />
            ))}
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto scrollbar-none">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={cn('h-20 w-20 flex-none overflow-hidden rounded-2xl border-2 bg-metal-50 transition sm:h-24 sm:w-24', i === index ? 'border-ink-900' : 'border-transparent opacity-70 hover:opacity-100')}
            >
              <img src={img.image} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <Modal open={lightbox} onClose={() => setLightbox(false)} title={product.name} hideTitle size="max-w-5xl">
        <div className="relative bg-metal-50">
          <img src={current.image} alt={current.alt_text || product.name} className="mx-auto max-h-[85vh] w-auto object-contain" />
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => move(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white p-3 shadow-lift" aria-label="Previous image">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => move(1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white p-3 shadow-lift" aria-label="Next image">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
