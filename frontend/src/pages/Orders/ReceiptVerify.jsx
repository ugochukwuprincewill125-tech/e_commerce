import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, ReceiptText, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import Seo from '../../components/Seo/Seo'
import { errorMessage } from '../../services/api'
import { orderService } from '../../services/orderService'
import { formatDateTime, formatNaira } from '../../utils/format'

/**
 * Public receipt authenticity check. The code printed on every platform
 * receipt is derived server-side from the payment facts, so only receipts we
 * actually issued verify — a screenshot someone doctored will not.
 */
export default function ReceiptVerify() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    setResult(null)
    try {
      setResult(await orderService.verifyReceipt(values))
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  return (
    <>
      <Seo
        title="Verify a receipt"
        description="Check whether a Timeline Gadgets receipt is genuine before treating it as proof of payment."
      />
      <div className="container max-w-4xl py-10 sm:py-16">
        <Breadcrumbs items={[{ label: 'Verify receipt' }]} />
        <div className="mt-6 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white">
            <ReceiptText className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold">Verify a receipt</h1>
            <p className="text-metal-500">
              Anyone can check a receipt here — staff, customers and third parties. Every genuine receipt carries a
              verification code; fakes don't verify.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="card mt-8 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
          <Field label="Order number" placeholder="TGS-260924-ABCDE" error={errors.order_number?.message} {...register('order_number', { required: 'Enter the order number on the receipt' })} />
          <Field label="Verification code" placeholder="XXXX-XXXX-XXXX" error={errors.code?.message} {...register('code', { required: 'Enter the code printed on the receipt' })} />
          <Button type="submit" size="lg" loading={isSubmitting}>
            Verify
          </Button>
        </form>
        <div className="mt-4">
          <FormAlert>{error}</FormAlert>
        </div>

        <AnimatePresence>
          {result && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="card mt-8 p-5 sm:p-8"
            >
              {result.valid ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <BadgeCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-ink-900">Genuine receipt</p>
                      <p className="text-sm text-metal-500">This payment receipt was issued by Timeline Gadgets.</p>
                    </div>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-metal-500">Order</dt>
                      <dd className="font-semibold text-ink-900">{result.order_number}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-metal-500">Paid</dt>
                      <dd className="font-semibold text-ink-900">{formatNaira(result.total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-metal-500">Paid on</dt>
                      <dd className="font-semibold text-ink-900">{formatDateTime(result.paid_at)}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs text-metal-500">Status on record: {result.status}</p>
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-100 text-red-700">
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <p className="text-sm text-metal-600">{result.detail}</p>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        <p className="mt-8 text-[13px] text-metal-500">
          Bought from us? Your receipts live in{' '}
          <Link to="/account/receipts" className="font-semibold text-ink-900 hover:text-brand-700">
            My Receipts
          </Link>
          .
        </p>
      </div>
    </>
  )
}
