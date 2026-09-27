import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Heart, MailWarning, MapPin, Package, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage } from '../../services/api'
import { authService, userService } from '../../services/authService'
import { formatDate, formatNaira } from '../../utils/format'

/** Jumia-style stat tile: number first, label second, flat hairline border. */
function Stat({ icon: Icon, label, value, to, delay }) {
  return (
    <Link
      to={to}
      style={{ transitionDelay: `${delay}ms` }}
      className="group flex items-center gap-3.5 rounded-md border border-line bg-white p-4 transition-colors hover:border-ink-900"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded border border-line bg-metal-50 text-ink-800 transition-colors group-hover:border-brand-600 group-hover:bg-brand-50 group-hover:text-brand-700">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-none tabular-nums text-ink-900">{value ?? 0}</span>
        <span className="mt-1 block truncate text-xs text-metal-500">{label}</span>
      </span>
    </Link>
  )
}

function ThumbStack({ items }) {
  return (
    <div className="flex -space-x-2">
      {items.slice(0, 3).map((it) => (
        <span key={it.id} className="h-9 w-9 overflow-hidden rounded border-2 border-white bg-white">
          {it.image && <img src={it.image} alt="" className="h-full w-full object-contain p-0.5" />}
        </span>
      ))}
    </div>
  )
}

export default function Overview() {
  const { user } = useAuth()
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: userService.dashboard })

  const resend = async () => {
    setSending(true)
    try {
      toast.success((await authService.resendVerification()).detail)
    } catch (err) {
      toast.error('Could not send email', errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div className="space-y-4">
      {!user.email_verified && (
        <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <MailWarning className="h-4 w-4 flex-none" strokeWidth={1.75} /> Please verify your email address ({user.email}).
          </p>
          <Button size="sm" variant="outline" onClick={resend} loading={sending}>
            Resend link
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[74px] rounded-md" />)
        ) : (
          <>
            <Stat icon={Package} label="Total orders" value={data.total_orders} to="/account/orders" />
            <Stat icon={Truck} label="Orders in progress" value={data.pending_orders} to="/account/orders" />
            <Stat icon={Heart} label="Wishlist items" value={data.wishlist_count} to="/account/wishlist" />
          </>
        )}
      </div>

      {/* Recent orders */}
      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink-900">Recent orders</h2>
          <Link to="/account/orders" className="flex items-center gap-1 text-[13px] font-semibold text-brand-700 transition-colors hover:text-brand-800">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-none" />
            ))}
          </div>
        ) : !data.recent_orders.length ? (
          <EmptyState icon={Package} title="No orders yet" message="When you place an order it will appear here." action={{ label: 'Start shopping', to: '/shop' }} className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {data.recent_orders.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/account/orders/${o.order_number}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-metal-50"
                >
                  <ThumbStack items={o.items} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-900">{o.order_number}</p>
                    <p className="text-[11px] text-metal-500">
                      {formatDate(o.created_at)} &middot; {o.item_count} item{o.item_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    <OrderStatusBadge status={o.status} label={o.status_display} />
                    <PaymentStatusBadge status={o.payment_status} label={o.payment_status_display} />
                  </div>
                  <p className="w-20 flex-none text-right text-[13px] font-bold tabular-nums text-ink-900">{formatNaira(o.total)}</p>
                  <ArrowRight className="h-4 w-4 flex-none text-metal-300" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { to: '/account/addresses', Icon: MapPin, title: 'Saved addresses', sub: `${data?.address_count ?? 0} saved` },
          { to: '/track-order', Icon: Truck, title: 'Track an order', sub: 'Use your order number and email' },
        ].map(({ to, Icon, title, sub }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-md border border-line bg-white p-4 transition-colors hover:border-ink-900"
          >
            <Icon className="h-4.5 w-4.5 flex-none text-brand-600" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink-900">{title}</span>
              <span className="block truncate text-xs text-metal-500">{sub}</span>
            </span>
            <ArrowRight className="h-4 w-4 flex-none text-metal-300 transition-colors group-hover:text-ink-900" strokeWidth={1.75} />
          </Link>
        ))}
      </div>
    </div>
  )
}
