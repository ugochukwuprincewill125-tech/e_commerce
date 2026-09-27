import { motion } from 'framer-motion'
import { ArrowRight, Headphones, MapPin, Package, ShieldCheck, Store, Truck, Wallet } from 'lucide-react'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import Logo from '../../components/Logo/Logo'
import Reveal from '../../components/Motion/Reveal'
import SectionHeading from '../../components/Section/SectionHeading'
import Seo from '../../components/Seo/Seo'
import useStoreInfo from '../../hooks/useStoreInfo'

const PILLARS = [
  { icon: Package, title: 'Quality gadgets', text: 'Smartphones, tablets, laptops and computers selected for performance, reliability and value.' },
  { icon: Headphones, title: 'Technology accessories', text: 'Chargers, cables, power banks, audio, storage, networking and gaming gear — all under one roof.' },
  { icon: ShieldCheck, title: 'Customer service', text: 'Honest advice before you buy and real people to help after — in store, by email or on Instagram.' },
  { icon: Wallet, title: 'Competitive pricing', text: 'Fair prices from the heart of Lagos’ technology market, with transparent totals at checkout.' },
  { icon: Truck, title: 'Nationwide delivery', text: 'Fast delivery within Lagos and dependable shipping to every state in Nigeria.' },
  { icon: Store, title: 'Physical locations', text: 'Two stores in Computer Village, Ikeja — see products in person or collect your online order.' },
]

export default function About() {
  const { company } = useStoreInfo()
  return (
    <>
      <Seo title="About us" description="Timeline Global Systems Limited is a technology and gadget supplier operating from Computer Village, Ikeja, Lagos — Home of Quality Gadgets." />

      <section className="bg-ink-950 text-white">
        <div className="container py-16 sm:py-20">
          <Breadcrumbs items={[{ label: 'About us' }]} dark />
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-6 max-w-3xl text-display-sm text-white sm:text-display"
          >
            A technology supplier based in Computer Village, Ikeja.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="mt-6 max-w-2xl text-[15px] leading-relaxed text-metal-400 sm:text-base"
          >
            {company.name} supplies smartphones, computers, accessories and networking equipment from Lagos' busiest
            technology marketplace. We serve individuals, students and businesses, in store and online.
          </motion.p>
        </div>
      </section>

      <section className="container grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow">Who we are</p>
          <h2 className="mt-3 text-3xl font-bold">Home of Quality Gadgets</h2>
          <div className="mt-5 space-y-4 leading-relaxed text-metal-600">
            <p>
              From the latest smartphones and laptops to the cables, chargers and storage that keep them running, Timeline Global Systems brings together a wide range of technology in one place — in store and online.
            </p>
            <p>
              Our online store connects directly to our inventory, so what you see is what we have. Every order is priced and confirmed by our system, and you can follow its progress from the moment it’s placed until it reaches you.
            </p>
            <p>Prefer to shop in person? Visit our main office on Oremeji Street or our branch on Otigba Street, both in Computer Village, Ikeja.</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/shop" iconRight={ArrowRight}>
              Shop now
            </Button>
            <Button to="/contact" variant="outline" icon={MapPin}>
              Visit our stores
            </Button>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[2rem] bg-metal-50">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(47,107,255,.12),transparent_60%)]" />
            <div className="relative text-center">
              <Logo size="lg" linked={false} />
              <p className="mt-6 text-sm text-metal-500">Computer Village · Ikeja · Lagos</p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-metal-50/70 py-16 sm:py-24">
        <div className="container">
          <SectionHeading eyebrow="What we stand for" title="Why customers choose Timeline" align="center" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 0.05}>
                <div className="card h-full p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-900 text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-sans text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-metal-500">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-16 sm:py-24">
        <SectionHeading eyebrow="Find us" title="Our locations" />
        <div className="grid gap-4 md:grid-cols-2">
          {company.locations.map((loc, i) => (
            <Reveal key={loc.id} delay={i * 0.08}>
              <div className="card flex h-full gap-4 p-7">
                <MapPin className="mt-1 h-5 w-5 flex-none text-brand-500" />
                <div>
                  <p className="font-semibold">{loc.label}</p>
                  <address className="mt-2 not-italic leading-7 text-metal-600">
                    {loc.lines.map((l) => (
                      <span key={l} className="block">
                        {l}
                      </span>
                    ))}
                  </address>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
