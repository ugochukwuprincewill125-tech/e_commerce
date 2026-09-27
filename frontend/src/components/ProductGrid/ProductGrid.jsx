import { motion } from 'framer-motion'
import { useState } from 'react'

import { fadeUp, stagger } from '../Motion/Reveal'
import ProductCard from '../ProductCard/ProductCard'
import QuickViewModal from '../QuickView/QuickViewModal'
import { cn } from '../../utils/format'

/** Responsive grid: 2 columns on mobile, 3 on tablet, 4 on desktop. */
export default function ProductGrid({ products, className, columns = 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' }) {
  const [quickView, setQuickView] = useState(null)
  return (
    <>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className={cn('grid gap-3', columns, className)}
      >
        {products.map((product, i) => (
          <motion.div key={product.id} variants={fadeUp}>
            <ProductCard product={product} onQuickView={setQuickView} priority={i < 4} />
          </motion.div>
        ))}
      </motion.div>
      <QuickViewModal slug={quickView?.slug} preview={quickView} onClose={() => setQuickView(null)} />
    </>
  )
}
