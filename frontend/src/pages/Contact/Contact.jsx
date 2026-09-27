import { Clock, Mail, MapPin, Phone, Send } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import InstagramIcon from '../../components/Icons/InstagramIcon'
import Reveal from '../../components/Motion/Reveal'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import useStoreInfo from '../../hooks/useStoreInfo'
import { errorMessage, fieldErrors } from '../../services/api'
import { storeService } from '../../services/productService'

function MapPlaceholder({ location }) {
  // Google Maps placeholder. To embed a live map, replace this block with an
  // <iframe> using a Maps Embed API key (see README -> "Google Maps").
  const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.map_query)}`
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-line bg-metal-50 p-6 text-center transition-colors hover:border-ink-900"
      aria-label={`Open ${location.label} in Google Maps`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-white">
        <MapPin className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="text-[13px] font-semibold text-ink-900">Open in Google Maps</span>
      <span className="text-xs text-metal-500">View directions to {location.label}</span>
    </a>
  )
}


export default function Contact() {
  const { company } = useStoreInfo()
  const { user } = useAuth()
  const toast = useToast()
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: user ? user.full_name : '', email: user?.email || '', phone: user?.phone || '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    try {
      const res = await storeService.contact(values)
      toast.success('Message sent', res.detail)
      setSent(true)
      reset({ name: values.name, email: values.email, phone: values.phone, subject: '', message: '' })
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      setError(errorMessage(err))
    }
  })

  return (
    <>
      <Seo title="Contact us" description="Contact Timeline Global Systems Limited — Computer Village, Ikeja, Lagos. Email timelinegadget@gmail.com or visit our main office and branch." />
      <section className="border-b border-line bg-metal-50/60">
        <div className="container py-10 sm:py-14">
          <Breadcrumbs items={[{ label: 'Contact' }]} />
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Get in touch</h1>
          <p className="mt-2 max-w-2xl text-metal-500">Questions about a product, an order or bulk purchases? Send us a message or visit either of our stores.</p>
        </div>
      </section>

      <div className="container grid gap-8 py-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Reveal className="card p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <a href={`mailto:${company.email}`} className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 flex-none text-brand-500" />
                <span>
                  <span className="block text-sm font-semibold">Email</span>
                  <span className="text-sm text-metal-600">{company.email}</span>
                </span>
              </a>
              <a href={company.instagram} target="_blank" rel="noopener noreferrer" className="flex gap-3">
                <InstagramIcon className="mt-0.5 h-5 w-5 flex-none text-brand-500" />
                <span>
                  <span className="block text-sm font-semibold">Instagram</span>
                  <span className="text-sm text-metal-600">Timeline Gadgets ({company.instagram_handle})</span>
                </span>
              </a>
              <div className="flex gap-3 sm:col-span-2">
                <Phone className="mt-0.5 h-5 w-5 flex-none text-brand-500" />
                <span>
                  <span className="block text-sm font-semibold">Phone</span>
                  {company.phones?.length ? (
                    company.phones.map((p) => (
                      <a key={p} href={`tel:${p.replace(/\s/g, '')}`} className="block text-sm text-metal-600 hover:text-ink-900">
                        {p}
                      </a>
                    ))
                  ) : (
                    <span className="text-sm text-metal-600">Phone lines will be listed here soon. In the meantime, email us or use the form and we’ll get right back to you.</span>
                  )}
                </span>
              </div>
            </div>
          </Reveal>

          <div id="locations" className="scroll-mt-28 space-y-4">
            {company.locations.map((loc, i) => (
              <Reveal key={loc.id} delay={i * 0.06} className="card overflow-hidden p-4 sm:p-5">
                <div className="flex gap-3 px-1 pb-4">
                  <MapPin className="mt-0.5 h-5 w-5 flex-none text-brand-500" />
                  <div>
                    <p className="font-semibold">{loc.label}</p>
                    <address className="text-sm not-italic leading-6 text-metal-600">{loc.lines.join(' ')}</address>
                  </div>
                </div>
                <MapPlaceholder location={loc} />
              </Reveal>
            ))}
          </div>

          <Reveal className="card p-6">
            <p className="flex items-center gap-2 font-semibold">
              <Clock className="h-5 w-5 text-brand-500" /> Business hours
            </p>
            <dl className="mt-4 divide-y divide-metal-100 text-sm">
              {company.business_hours.map((h) => (
                <div key={h.days} className="flex justify-between py-2.5">
                  <dt className="text-metal-500">{h.days}</dt>
                  <dd className="font-medium">{h.hours}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.05}>
          <form onSubmit={onSubmit} noValidate className="card p-6 sm:p-8 lg:sticky lg:top-24">
            <h2 className="text-xl font-semibold">Send us a message</h2>
            <p className="mt-1 text-sm text-metal-500">We usually reply within one business day.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" autoComplete="name" error={errors.name?.message} {...register('name', { required: 'Please enter your name' })} />
              <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email', { required: 'Please enter your email', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
              <Field label="Phone (optional)" type="tel" autoComplete="tel" {...register('phone')} />
              <Field label="Subject" error={errors.subject?.message} {...register('subject', { required: 'Please add a subject' })} />
              <Field
                as="textarea"
                className="sm:col-span-2"
                label="Message"
                error={errors.message?.message}
                {...register('message', { required: 'Please write a message', minLength: { value: 10, message: 'Please write at least 10 characters' } })}
              />
            </div>
            <div className="mt-5">
              <FormAlert>{error}</FormAlert>
              {sent && !error && <FormAlert tone="success">Thanks! Your message has been sent.</FormAlert>}
            </div>
            <Button type="submit" size="lg" icon={Send} className="mt-6 w-full sm:w-auto" loading={isSubmitting}>
              Send message
            </Button>
          </form>
        </Reveal>
      </div>
    </>
  )
}
