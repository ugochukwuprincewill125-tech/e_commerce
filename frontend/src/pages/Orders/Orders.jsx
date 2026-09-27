import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, Package } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import { OrderStatusBadge, PaymentStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import Pagination from '../../components/Pagination/Pagination'
import { orderService } from '../../services/orderService'
import { cn, formatDate, formatNaira } from '../../utils/format'

const FILTERS = [
  { value: '', label: 'All orders' },
  { value: 'placed', label: 'Awaiting payment' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

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

export default function Orders() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders', status, page],
    queryFn: () => orderService.list({ status: status || undefined, page, page_size: 10 }),
    placeholderData: keepPreviousData,
  })

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">My orders</h2>
        {data && (
          <p className="text-[13px] text-metal-500">
            <strong className="font-semibold text-ink-900">{data.count}</strong> {data.count === 1 ? 'order' : 'orders'}
          </p>
        )}
      </div>

      {/* Jumia-style underline tabs */}
      <div className="scrollbar-none -mx-4 mt-4 flex gap-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Order status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={status === f.value}
            onClick={() => (setStatus(f.value), setPage(1))}
            className={cn(
              'relative flex-none whitespace-nowrap pb-2.5 text-[13px] font-semibold transition-colors',
              status === f.value ? 'text-ink-900' : 'text-metal-500 hover:text-ink-800',
            )}
          >
            {f.label}
            {status === f.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[68px] w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title="Unable to load orders" onRetry={refetch} />
        ) : !data.results.length ? (
          <EmptyState
            icon={Package}
            title={status ? 'No orders with this status' : 'No orders yet'}
            message="Your orders will appear here once you check out."
            action={{ label: 'Start shopping', to: '/shop' }}
          />
        ) : (
          <>
            {/* Jumia-style order rows */}
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
              {data.results.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/account/orders/${o.order_number}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-metal-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink-900">{o.order_number}</p>
                      <p className="mt-0.5 text-[11px] text-metal-500">
                        {formatDate(o.created_at)} &middot; {o.item_count} item{o.item_count === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="hidden sm:block">
                      <ThumbStack items={o.items} />
                    </div>

                    <div className="hidden w-24 flex-none text-right sm:block">
                      <p className="text-[13px] font-bold tabular-nums text-ink-900">{formatNaira(o.total)}</p>
                    </div>

                    <div className="w-28 flex-none">
                      <OrderStatusBadge status={o.status} label={o.status_display} />
                    </div>

                    <ChevronRight className="h-4 w-4 flex-none text-metal-300" strokeWidth={1.75} />
                  </Link>

                  <div className="flex items-center gap-2 border-t border-line bg-metal-50 px-4 py-1.5 sm:hidden">
                    <PaymentStatusBadge status={o.payment_status} label={o.payment_status_display} />
                    <span className="ml-auto text-[13px] font-bold tabular-nums text-ink-900">{formatNaira(o.total)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination page={data.current_page} totalPages={data.total_pages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
