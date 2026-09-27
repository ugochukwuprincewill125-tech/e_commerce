import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Mail } from 'lucide-react'
import { useState } from 'react'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import Reveal from '../../components/Motion/Reveal'
import Seo from '../../components/Seo/Seo'
import useStoreInfo from '../../hooks/useStoreInfo'
import { cn, formatNaira } from '../../utils/format'
import { INFO } from './content'

function Faq({ q, a, open, onToggle }) {
  return (
    <div className="border-b border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold">
        {q}
        <ChevronDown className={cn('h-5 w-5 flex-none text-metal-400 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="pb-5 leading-relaxed text-metal-600">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function InfoPage({ page }) {
  const content = INFO[page]
  const { shipping } = useStoreInfo()
  const [open, setOpen] = useState(0)

  return (
    <>
      <Seo title={content.title} description={content.intro} />
      <section className="border-b border-line bg-metal-50/60">
        <div className="container max-w-4xl py-10 sm:py-14">
          <Breadcrumbs items={[{ label: content.title }]} />
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{content.title}</h1>
          <p className="mt-2 text-metal-500">{content.intro}</p>
        </div>
      </section>
      <div className="container max-w-4xl py-12">
        {content.sections?.map((s, i) => (
          <Reveal key={s.heading} delay={i * 0.04} className="border-b border-line py-7 first:pt-0">
            <h2 className="text-xl font-semibold">{s.heading}</h2>
            <p className="mt-2 leading-relaxed text-metal-600">{s.body}</p>
            {s.showRates && shipping && (
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Lagos', formatNaira(shipping.lagos)],
                  ['Other South-West states', formatNaira(shipping.south_west)],
                  ['All other states', formatNaira(shipping.default)],
                  ['Store pickup', 'Free'],
                  ['Orders from ' + formatNaira(shipping.free_shipping_threshold), 'Free delivery'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl bg-metal-50 px-4 py-3 text-sm">
                    <dt className="text-metal-500">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Reveal>
        ))}
        {content.faqs && (
          <div>
            {content.faqs.map((f, i) => (
              <Faq key={f.q} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
            ))}
          </div>
        )}
        <div className="mt-12 flex flex-col items-start gap-4 rounded-lg bg-ink-900 p-8 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">Still have questions?</p>
            <p className="text-sm text-metal-300">Our team is happy to help.</p>
          </div>
          <Button to="/contact" variant="white" icon={Mail}>
            Contact support
          </Button>
        </div>
      </div>
    </>
  )
}
