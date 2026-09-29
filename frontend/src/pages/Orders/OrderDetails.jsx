import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, PackageX, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import Modal from '../../components/Modal/Modal'
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import OrderTimeline from '../../components/OrderTimeline/OrderTimeline'
import { useToast } from '../../context/ToastContext'
import useStoreInfo from '../../hooks/useStoreInfo'
import { errorMessage } from '../../services/api'
import { orderService, paymentService } from '../../services/orderService'
import { formatDateTime, formatNaira } from '../../utils/format'

export default function OrderDetails() {
  const { orderNumber } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { company } = useStoreInfo()
  const [paying, setPaying] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const { data: order, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['orders', 'detail', orderNumber],
    queryFn: () => orderService.detail(orderNumber),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  })

  const pay = async () => {
    setPaying(true)
    try {
      const res = await paymentService.initialize(order.order_number)
      window.location.assign(res.authorization_url)
    } catch (err) {
      toast.error('Payment couldn’t start', errorMessage(err))
      setPaying(false)
    }
  }

  const cancel = async () => {
    setCancelling(true)
    try {
      const updated = await orderService.cancel(order.order_number)
      queryClient.setQueryData(['orders', 'detail', orderNumber], updated)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.info('Order cancelled', 'Reserved items were returned to stock.')
      setConfirmCancel(false)
    } catch (err) {
      toast.error('Couldn’t cancel order', errorMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  if (isError) {
    if (error?.response?.status === 404) return <EmptyState icon={PackageX} title="Order not found" message="We couldn’t find that order on your account." action={{ label: 'My orders', to: '/account/orders' }} />
    return <ErrorState onRetry={refetch} />
  }

  const pickup = company.locations.find((l) => l.id === order.pickup_location)

  return (
    <div className="space-y-6">
      <Link to="/account/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-metal-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Order {order.order_number}</h2>
          <p className="mt-1 text-sm text-metal-500">Placed {formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderStatusBadge status={order.status} label={order.status_display} />
          <PaymentStatusBadge status={order.payment_status} label={order.payment_status_display} />
        </div>
      </div>

      {order.can_pay && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink-900">Payment pending</p>
            <p className="text-sm text-metal-600">Complete payment to confirm this order. Unpaid orders are released after a while.</p>
          </div>
          <div className="flex gap-2">
            {order.can_cancel && (
              <Button variant="outline" onClick={() => setConfirmCancel(true)} icon={XCircle}>
                Cancel
              </Button>
            )}
            <Button variant="accent" onClick={pay} loading={paying} icon={CreditCard}>
              Pay {formatNaira(order.total)}
            </Button>
          </div>
        </div>
      )}

      <section className="card p-5 sm:p-7">
        <h3 className="mb-6 font-sans text-base font-semibold">Order tracking</h3>
        <OrderTimeline steps={order.tracking} cancelled={order.status === 'cancelled'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card p-5 sm:p-6">
          <h3 className="font-sans text-base font-semibold">Items</h3>
          <ul className="mt-4 divide-y divide-metal-100">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-center gap-4 py-4">
                <span className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-metal-50">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  {it.product_slug ? (
                    <Link to={`/products/${it.product_slug}`} className="line-clamp-2 text-sm font-semibold hover:text-brand-600">
                      {it.product_name}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold">{it.product_name}</span>
                  )}
                  <span className="block text-xs text-metal-500">
                    {it.variant_label ? `${it.variant_label} · ` : ''}Qty {it.quantity} × {formatNaira(it.unit_price)}
                  </span>
                </span>
                <span className="text-sm font-bold">{formatNaira(it.total_price)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="card space-y-2.5 p-5 text-sm sm:p-6">
            <h3 className="mb-2 font-sans text-base font-semibold">Summary</h3>
            <div className="flex justify-between">
              <span className="text-metal-500">Subtotal</span>
              <span>{formatNaira(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount {order.coupon_code && `(${order.coupon_code})`}</span>
                <span>−{formatNaira(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-metal-500">{order.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}</span>
              <span>{Number(order.shipping_fee) ? formatNaira(order.shipping_fee) : 'Free'}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <span>Total</span>
              <span>{formatNaira(order.total)}</span>
            </div>
            {order.payment_reference && <p className="pt-2 text-xs text-metal-400">Payment ref: {order.payment_reference}</p>}
          </section>
          <section className="card p-5 text-sm sm:p-6">
            <h3 className="font-sans text-base font-semibold">{order.delivery_method_display}</h3>
            <p className="mt-2 leading-relaxed text-metal-600">
              {order.first_name} {order.last_name}
              <br />
              {order.phone}
              <br />
              {order.delivery_method === 'pickup'
                ? pickup?.lines.join(' ')
                : [order.shipping_address.address, order.shipping_address.city, order.shipping_address.state, order.shipping_address.country].filter(Boolean).join(', ')}
            </p>
            {(order.carrier || order.tracking_number) && (
              <p className="mt-3 rounded-xl bg-metal-50 p-3 text-xs text-metal-600">
                {order.carrier && <span className="font-medium">Carrier: {order.carrier}</span>}
                {order.carrier && order.tracking_number && ' · '}
                {order.tracking_number && <span>Tracking number: {order.tracking_number}</span>}
              </p>
            )}
            {order.customer_note && <p className="mt-3 rounded-xl bg-metal-50 p-3 text-xs text-metal-600">Note: {order.customer_note}</p>}
          </section>
        </div>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this order?">
        <div className="p-5 sm:p-6">
          <p className="text-sm text-metal-600">Order {order.order_number} will be cancelled and its items returned to stock. This can’t be undone.</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep order
            </Button>
            <Button variant="danger" onClick={cancel} loading={cancelling}>
              Cancel order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
