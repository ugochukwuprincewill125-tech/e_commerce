import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, CreditCard, Lock, MapPin, ShieldCheck, ShoppingBag, Store, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'

import Button from '../../components/Button/Button'
import EmptyState from '../../components/EmptyState/EmptyState'
import { Field, FormAlert } from '../../components/Form/Field'
import { PageLoader } from '../../components/Loader/Skeleton'
import OrderSummary from '../../components/OrderSummary/OrderSummary'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import useCheckoutPrefs from '../../hooks/useCheckoutPrefs'
import useQuote from '../../hooks/useQuote'
import useStoreInfo from '../../hooks/useStoreInfo'
import { errorMessage, fieldErrors } from '../../services/api'
import { userService } from '../../services/authService'
import { cartService } from '../../services/cartService'
import { orderService, paymentService } from '../../services/orderService'
import { cn, formatNaira } from '../../utils/format'

const STEPS = [
  { key: 'customer', label: 'Customer', fields: ['first_name', 'last_name', 'email', 'phone'] },
  { key: 'delivery', label: 'Delivery', fields: ['address', 'city', 'state', 'country'] },
  { key: 'review', label: 'Review', fields: [] },
  { key: 'payment', label: 'Payment', fields: [] },
]

function Stepper({ step, onJump }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Checkout progress">
      {STEPS.map((s, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={!done}
              onClick={() => onJump(i)}
              className={cn('flex items-center gap-2 text-left', done && 'cursor-pointer')}
              aria-current={active ? 'step' : undefined}
            >
              <motion.span
                animate={{ scale: active ? 1.08 : 1 }}
                className={cn(
                  'flex h-8 w-8 flex-none items-center justify-center rounded text-[13px] font-bold transition-colors',
                  done ? 'bg-brand-600 text-white' : active ? 'bg-ink-900 text-white' : 'border border-line bg-white text-metal-400',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </motion.span>
              <span className={cn('hidden text-[13px] font-semibold sm:block', active || done ? 'text-ink-900' : 'text-metal-400')}>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="relative h-px flex-1 overflow-hidden bg-line">
                <motion.span className="absolute inset-y-0 left-0 bg-brand-600" initial={false} animate={{ width: done ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function Checkout() {
  const { user } = useAuth()
  const { items, isLoading: cartLoading, hasIssues, refresh: refreshCart } = useCart()
  const { states, company } = useStoreInfo()
  const [prefs, setPrefs] = useCheckoutPrefs()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitError, setSubmitError] = useState('')
  const [couponError, setCouponError] = useState('')
  const [placing, setPlacing] = useState(false)

  const addresses = useQuery({ queryKey: ['addresses'], queryFn: userService.addresses })
  const payConfig = useQuery({ queryKey: ['payment-config'], queryFn: paymentService.config, staleTime: 600_000 })

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    mode: 'onTouched',
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: '',
      city: '',
      state: prefs.state || '',
      country: 'Nigeria',
      postal_code: '',
      pickup_location: 'main-office',
      note: '',
      save_address: true,
    },
  })

  const deliveryMethod = prefs.delivery_method
  const state = watch('state')
  const quote = useQuote({ coupon_code: prefs.coupon_code, state: deliveryMethod === 'delivery' ? state : '', delivery_method: deliveryMethod })

  // Pre-fill with the default saved address.
  useEffect(() => {
    const def = addresses.data?.find((a) => a.is_default)
    if (def) {
      ;['address', 'city', 'state', 'country', 'postal_code'].forEach((k) => setValue(k, def[k] || ''))
      setValue('save_address', false)
    }
  }, [addresses.data, setValue])

  useEffect(() => {
    if (state) setPrefs({ state })
  }, [state, setPrefs])

  const applyAddress = (a) => {
    ;['address', 'city', 'state', 'country', 'postal_code'].forEach((k) => setValue(k, a[k] || '', { shouldValidate: true }))
    setValue('first_name', a.first_name)
    setValue('last_name', a.last_name)
    setValue('phone', a.phone)
    setValue('save_address', false)
  }

  const next = async () => {
    const fields = step === 1 && deliveryMethod === 'pickup' ? [] : STEPS[step].fields
    const ok = await trigger(fields)
    if (ok) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const applyCoupon = async (code) => {
    setCouponError('')
    try {
      const res = await cartService.applyCoupon({ code, state, delivery_method: deliveryMethod })
      setPrefs({ coupon_code: code })
      toast.success(res.detail)
    } catch (err) {
      setCouponError(errorMessage(err))
    }
  }

  const placeOrder = handleSubmit(async (values) => {
    setSubmitError('')
    setPlacing(true)
    let order
    try {
      order = await orderService.create({
        ...values,
        delivery_method: deliveryMethod,
        coupon_code: quote.data?.coupon?.valid ? prefs.coupon_code : '',
      })
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setError(k, { message: v }))
      setSubmitError(errorMessage(err, 'We couldn’t place your order.'))
      setPlacing(false)
      return
    }
    refreshCart()
    try {
      const pay = await paymentService.initialize(order.order_number)
      setPrefs({ coupon_code: '' })
      window.location.assign(pay.authorization_url)
    } catch (err) {
      toast.error('Order placed, payment not started', errorMessage(err))
      navigate(`/account/orders/${order.order_number}`)
    }
  })

  const summaryItems = useMemo(() => items.slice(0, 20), [items])

  if (cartLoading) return <PageLoader />
  if (!items.length && !placing) {
    return <EmptyState icon={ShoppingBag} title="Your cart is empty" message="Add a few gadgets to your cart before checking out." action={{ label: 'Browse products', to: '/shop' }} className="py-28" />
  }

  const pickupLocation = watch('pickup_location')
  const values = watch()

  return (
    <>
      <Seo title="Checkout" noindex />
      <div className="border-b border-line bg-white">
        <div className="container py-5">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Checkout</h1>
            <Link to="/cart" className="flex items-center gap-1.5 text-[13px] font-semibold text-metal-500 transition-colors hover:text-ink-900">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Back to cart
            </Link>
          </div>
          <div className="mt-5">
            <Stepper step={step} onJump={setStep} />
          </div>
        </div>
      </div>

      <div className="bg-metal-50 py-6">
        <div className="container grid items-start gap-5 lg:grid-cols-[1fr_340px]">
          <form onSubmit={(e) => e.preventDefault()} noValidate className="rounded-md border border-line bg-white p-5 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                {step === 0 && (
                  <section aria-labelledby="step-customer">
                    <h2 id="step-customer" className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">
                      Customer information
                    </h2>
                    <p className="mt-1 text-sm text-metal-500">We’ll use these details to contact you about your order.</p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <Field label="First name" autoComplete="given-name" error={errors.first_name?.message} {...register('first_name', { required: 'First name is required' })} />
                      <Field label="Last name" autoComplete="family-name" error={errors.last_name?.message} {...register('last_name', { required: 'Last name is required' })} />
                      <Field
                        label="Email"
                        type="email"
                        autoComplete="email"
                        error={errors.email?.message}
                        {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })}
                      />
                      <Field
                        label="Phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="e.g. 0803 000 0000"
                        error={errors.phone?.message}
                        {...register('phone', { required: 'Phone number is required', pattern: { value: /^\+?[0-9\s\-()]{7,20}$/, message: 'Enter a valid phone number' } })}
                      />
                    </div>
                  </section>
                )}

                {step === 1 && (
                  <section aria-labelledby="step-delivery">
                    <h2 id="step-delivery" className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">
                      Delivery
                    </h2>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {[
                        { value: 'delivery', icon: Truck, title: 'Deliver to me', text: 'Home or office, anywhere in Nigeria' },
                        { value: 'pickup', icon: Store, title: 'Store pickup', text: 'Free — Computer Village, Ikeja' },
                      ].map(({ value, icon: Icon, title, text }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPrefs({ delivery_method: value })}
                          aria-pressed={deliveryMethod === value}
                          className={cn('flex items-start gap-3 rounded-md border p-3.5 text-left transition-colors', deliveryMethod === value ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-ink-900')}
                        >
                          <Icon className="mt-0.5 h-4 w-4 flex-none text-brand-600" strokeWidth={1.75} />
                          <span>
                            <span className="block text-[13px] font-semibold text-ink-900">{title}</span>
                            <span className="mt-0.5 block text-xs text-metal-500">{text}</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {deliveryMethod === 'delivery' ? (
                      <>
                        {addresses.data?.length > 0 && (
                          <div className="mt-6">
                            <p className="label">Saved addresses</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {addresses.data.map((a) => (
                                <button key={a.id} type="button" onClick={() => applyAddress(a)} className={cn('rounded border p-2.5 text-left text-xs transition-colors hover:border-ink-900', values.address === a.address ? 'border-brand-600 bg-brand-50' : 'border-line bg-white')}>
                                  <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                                    <MapPin className="h-3.5 w-3.5 flex-none text-brand-600" strokeWidth={1.75} /> {a.label || `${a.first_name} ${a.last_name}`}
                                    {a.is_default && <span className="chip bg-ink-900 px-1.5 py-0 text-[9px] text-white">Default</span>}
                                  </span>
                                  <span className="mt-1 block text-metal-500">
                                    {a.address}, {a.city}, {a.state}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                          <Field className="sm:col-span-2" label="Street address" autoComplete="street-address" placeholder="House number and street" error={errors.address?.message} {...register('address', { validate: (v) => deliveryMethod === 'pickup' || v.trim().length > 3 || 'Enter your delivery address' })} />
                          <Field label="City / Area" autoComplete="address-level2" error={errors.city?.message} {...register('city', { validate: (v) => deliveryMethod === 'pickup' || v.trim().length > 1 || 'Enter your city' })} />
                          <Field as="select" label="State" error={errors.state?.message} {...register('state', { validate: (v) => deliveryMethod === 'pickup' || Boolean(v) || 'Select your state' })}>
                            <option value="">Select state</option>
                            {states.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Field>
                          <Field label="Country" autoComplete="country-name" readOnly {...register('country')} />
                          <Field label="Postal code (optional)" autoComplete="postal-code" {...register('postal_code')} />
                        </div>
                        <label className="mt-5 flex items-center gap-3 text-sm">
                          <input type="checkbox" className="h-4 w-4 rounded border-metal-300 text-ink-900" {...register('save_address')} /> Save this address to my account
                        </label>
                      </>
                    ) : (
                      <fieldset className="mt-6">
                        <legend className="label">Choose pickup location</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {company.locations.map((loc) => (
                            <label key={loc.id} className={cn('cursor-pointer rounded-md border p-3.5 text-[13px] transition-colors', pickupLocation === loc.id ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-ink-900')}>
                              <input type="radio" value={loc.id} className="sr-only" {...register('pickup_location')} />
                              <span className="block text-[13px] font-semibold text-ink-900">{loc.label}</span>
                              <span className="mt-1 block text-xs leading-relaxed text-metal-500">{loc.lines.join(' ')}</span>
                            </label>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-metal-400">We’ll contact you when your order is ready for collection.</p>
                      </fieldset>
                    )}
                  </section>
                )}

                {step === 2 && (
                  <section aria-labelledby="step-review">
                    <h2 id="step-review" className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">
                      Review your order
                    </h2>
                    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line">
                      {summaryItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-4 p-4">
                          <span className="h-14 w-14 flex-none rounded border border-line bg-white p-1">
                            {item.product.image && <img src={item.product.image} alt="" className="h-full w-full object-contain" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 text-[13px] font-medium text-ink-900">{item.product.name}</span>
                            <span className="mt-0.5 block text-xs text-metal-500">
                              {item.selected_variant ? `${item.selected_variant.label} · ` : ''}Qty {item.quantity} × {formatNaira(item.unit_price)}
                            </span>
                          </span>
                          <span className="text-[13px] font-bold tabular-nums text-ink-900">{formatNaira(item.line_total)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                      <div className="rounded-md border border-line bg-white p-4">
                        <p className="text-[13px] font-semibold text-ink-900">Contact</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-metal-500">
                          {values.first_name} {values.last_name}
                          <br />
                          {values.email}
                          <br />
                          {values.phone}
                        </p>
                      </div>
                      <div className="rounded-md border border-line bg-white p-4">
                        <p className="text-[13px] font-semibold text-ink-900">{deliveryMethod === 'pickup' ? 'Store pickup' : 'Delivery address'}</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-metal-500">
                          {deliveryMethod === 'pickup'
                            ? company.locations.find((l) => l.id === pickupLocation)?.lines.join(' ')
                            : `${values.address}, ${values.city}, ${values.state}, ${values.country}`}
                        </p>
                      </div>
                    </div>
                    <Field as="textarea" className="mt-5" label="Order note (optional)" placeholder="Anything we should know about delivery?" {...register('note')} />
                  </section>
                )}

                {step === 3 && (
                  <section aria-labelledby="step-payment">
                    <h2 id="step-payment" className="text-[15px] font-semibold uppercase tracking-wide text-ink-900">
                      Payment
                    </h2>
                    <div className="mt-4 flex items-start gap-3 rounded-md border border-brand-600 bg-brand-50 p-4">
                      <CreditCard className="mt-0.5 h-5 w-5 flex-none text-brand-600" strokeWidth={1.75} />
                      <div>
                        <p className="text-[13px] font-semibold text-ink-900">Pay securely with Paystack</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-metal-500">Card, bank transfer or USSD. You’ll be redirected to Paystack’s secure page to complete payment.</p>
                      </div>
                    </div>
                    {payConfig.data?.test_mode && (
                      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
                        <strong>Test mode:</strong> Paystack keys are not configured on the server, so payment will be simulated and no money will be charged. Add your keys in <code>backend/.env</code> to take real payments.
                      </div>
                    )}
                    <ul className="mt-6 space-y-2 text-sm text-metal-600">
                      <li className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-success" strokeWidth={1.75} /> <span>Your order total is calculated and verified by our server.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Lock className="mt-0.5 h-4 w-4 flex-none text-success" strokeWidth={1.75} /> <span>We never see or store your card details.</span>
                      </li>
                    </ul>
                    <div className="mt-6">
                      <FormAlert>{submitError}</FormAlert>
                    </div>
                  </section>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
              {step > 0 ? (
                <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step < STEPS.length - 1 ? (
                <Button onClick={next} iconRight={ArrowRight} size="lg" variant="accent">
                  Continue
                </Button>
              ) : (
                <Button variant="accent" size="lg" icon={Lock} loading={placing} disabled={hasIssues || !quote.data} onClick={placeOrder}>
                  Pay {formatNaira(quote.data?.total || 0)}
                </Button>
              )}
            </div>
          </form>

          <div className="lg:sticky lg:sticky-chrome lg:self-start">
            <OrderSummary
              quote={quote.data}
              loading={quote.isFetching}
              couponCode={prefs.coupon_code}
              couponError={couponError}
              onApplyCoupon={applyCoupon}
              onRemoveCoupon={() => {
                setPrefs({ coupon_code: '' })
                setCouponError('')
              }}
            >
              <ul className="mt-4 space-y-3 border-t border-line pt-4">
                {items.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 text-sm">
                    <span className="relative h-11 w-11 flex-none rounded border border-line bg-white p-1">
                      {item.product.image && <img src={item.product.image} alt="" className="h-full w-full object-contain" />}
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-900 px-1 text-[10px] font-bold leading-4 text-white">{item.quantity}</span>
                    </span>
                    <span className="line-clamp-2 flex-1 text-[13px] text-ink-900">{item.product.name}</span>
                    <span className="flex-none text-[13px] font-bold tabular-nums text-ink-900">{formatNaira(item.line_total)}</span>
                  </li>
                ))}
                {items.length > 4 && <li className="text-xs text-metal-400">+ {items.length - 4} more item(s)</li>}
              </ul>
            </OrderSummary>
          </div>
        </div>
      </div>
    </>
  )
}
