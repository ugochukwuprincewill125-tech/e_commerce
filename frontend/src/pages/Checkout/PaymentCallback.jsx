import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock3, LoaderCircle, Package, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import Seo from '../../components/Seo/Seo'
import { errorMessage } from '../../services/api'
import { paymentService } from '../../services/orderService'
import { formatNaira } from '../../utils/format'

/** Paystack redirects here with ?reference=… — the backend verifies the payment. */
export default function PaymentCallback() {
  const [params] = useSearchParams()
  const reference = params.get('reference') || params.get('trxref')
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['verify-payment', reference],
    queryFn: () => paymentService.verify(reference),
    enabled: Boolean(reference),
    retry: 1,
  })

  useEffect(() => {
    if (data?.success) {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    }
  }, [data, queryClient])

  // Paystack outcomes can settle after this page first loads (typical for
  // bank transfers, and for charges that were in flight when the customer
  // cancelled). Quietly re-check a few times before leaving it to them.
  const [autoChecks, setAutoChecks] = useState(0)
  useEffect(() => {
    if (!reference || isLoading || isError || data?.success || autoChecks >= 12) return undefined
    const timer = setTimeout(() => {
      setAutoChecks((count) => count + 1)
      refetch()
    }, 5000)
    return () => clearTimeout(timer)
  }, [reference, isLoading, isError, data, autoChecks, refetch])

  let content
  if (!reference) {
    content = (
      <>
        <XCircle className="mx-auto h-16 w-16 text-danger" />
        <h1 className="mt-6 text-2xl font-bold">Missing payment reference</h1>
        <p className="mt-2 text-metal-500">We couldn’t tell which payment to check. Your orders page shows the latest status.</p>
        <Button to="/account/orders" className="mt-8">
          View my orders
        </Button>
      </>
    )
  } else if (isLoading) {
    content = (
      <>
        <LoaderCircle className="mx-auto h-14 w-14 animate-spin text-brand-500" />
        <h1 className="mt-6 text-2xl font-bold">Confirming your payment…</h1>
        <p className="mt-2 text-metal-500">Please don’t close this page.</p>
      </>
    )
  } else if (data?.pending) {
    // Paystack hasn't finished (common with bank transfers): the payment is
    // still open — nothing has failed, so don't look like something did.
    content = (
      <>
        <Clock3 className="mx-auto h-16 w-16 text-amber-500" />
        <h1 className="mt-6 text-2xl font-bold">Payment still processing</h1>
        <p className="mt-2 text-metal-500">{data?.detail}</p>
        <p className="mt-2 text-sm text-metal-400">
          We’re re-checking automatically every few seconds — you can also leave this page; your order shows the latest status.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => refetch()} variant="outline">
            Check again
          </Button>
          {data?.order_number && <Button to={`/account/orders/${data.order_number}`}>Go to order</Button>}
        </div>
      </>
    )
  } else if (isError || !data?.success) {
    content = (
      <>
        <XCircle className="mx-auto h-16 w-16 text-danger" />
        <h1 className="mt-6 text-2xl font-bold">Payment not confirmed</h1>
        <p className="mt-2 text-metal-500">{isError ? errorMessage(error) : data?.detail}</p>
        <p className="mt-2 text-sm text-metal-400">
          If you were debited, please don’t pay again — payments are matched to your order automatically, and your order page shows the latest status.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => refetch()} variant="outline">
            Check again
          </Button>
          {data?.order_number && <Button to={`/account/orders/${data.order_number}`}>Go to order</Button>}
        </div>
      </>
    )
  } else {
    content = (
      <>
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="relative mx-auto h-20 w-20">
          <span className="absolute inset-0 animate-ping rounded-full bg-success/20" />
          <CheckCircle2 className="relative h-20 w-20 text-success" />
        </motion.div>
        <h1 className="mt-6 text-3xl font-bold">Thank you — payment received!</h1>
        <p className="mt-3 text-metal-500">
          Order <strong className="text-ink-900">{data.order_number}</strong> · {formatNaira(data.amount)}
        </p>
        {data.test_mode && <p className="mt-2 text-xs font-medium text-amber-700">Test mode — no real money was charged.</p>}
        <p className="mt-2 text-sm text-metal-500">We’ve started processing your order and will keep you updated.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to="/account/orders" icon={Package}>
            Track order
          </Button>
          <Button to="/shop" variant="outline">
            Continue shopping
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <Seo title="Payment status" noindex />
      <div className="container flex min-h-[60vh] items-center justify-center py-16">
        <div className="max-w-lg text-center">{content}</div>
      </div>
    </>
  )
}
