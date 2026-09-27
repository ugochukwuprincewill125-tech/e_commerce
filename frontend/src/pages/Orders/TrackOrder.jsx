import { AnimatePresence, motion } from 'framer-motion'
import { PackageSearch } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import OrderTimeline from '../../components/OrderTimeline/OrderTimeline'
import Seo from '../../components/Seo/Seo'
import { errorMessage } from '../../services/api'
import { orderService } from '../../services/orderService'
import { formatDate } from '../../utils/format'

export default function TrackOrder() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    try {
      setResult(await orderService.track(values))
    } catch (err) {
      setResult(null)
      setError(errorMessage(err))
    }
  })

  return (
    <>
      <Seo title="Track your order" description="Check the status of your Timeline Gadgets order with your order number and email." />
      <div className="container max-w-4xl py-10 sm:py-16">
        <Breadcrumbs items={[{ label: 'Track order' }]} />
        <div className="mt-6 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white">
            <PackageSearch className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold">Track your order</h1>
            <p className="text-metal-500">Enter the order number from your confirmation and the email you used.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="card mt-8 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
          <Field label="Order number" placeholder="TGS-260924-ABCDE" error={errors.order_number?.message} {...register('order_number', { required: 'Enter your order number' })} />
          <Field label="Email" type="email" error={errors.email?.message} {...register('email', { required: 'Enter your email' })} />
          <Button type="submit" size="lg" loading={isSubmitting}>
            Track
          </Button>
        </form>
        <div className="mt-4">
          <FormAlert>{error}</FormAlert>
        </div>

        <AnimatePresence>
          {result && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card mt-8 p-5 sm:p-8">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-metal-500">Order</p>
                  <p className="text-xl font-bold">{result.order_number}</p>
                  <p className="text-xs text-metal-400">
                    Placed {formatDate(result.created_at)} · {result.item_count} item(s)
                  </p>
                </div>
                <div className="flex gap-2">
                  <OrderStatusBadge status={result.status} label={result.status_display} />
                  <PaymentStatusBadge status={result.payment_status} label={result.payment_status_display} />
                </div>
              </div>
              <OrderTimeline steps={result.tracking} cancelled={result.status === 'cancelled'} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
