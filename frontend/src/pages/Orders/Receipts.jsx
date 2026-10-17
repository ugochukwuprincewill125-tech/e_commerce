import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileText, Package } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import Pagination from '../../components/Pagination/Pagination'
import { orderService } from '../../services/orderService'
import { formatDate, formatNaira } from '../../utils/format'

export default function Receipts() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['receipts', page],
    queryFn: () => orderService.list({ payment_status: 'paid', page, page_size: 20 }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[19px] font-semibold tracking-tight text-ink-900">My receipts</h2>
        {data && (
          <p className="text-[13px] text-metal-500">
            <strong className="font-semibold text-ink-900">{data.count}</strong> {data.count === 1 ? 'receipt' : 'receipts'}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : !data.results.length ? (
        <EmptyState
          icon={FileText}
          title="No receipts yet"
          message="Receipts appear here once you have a paid order."
          action={{ label: 'Shop now', to: '/shop' }}
        />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {data.results.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/account/receipts/${o.payment_reference || o.order_number}`}
                  className="flex items-center gap-4 px-4 py-3.5 text-sm transition-colors hover:bg-metal-50"
                >
                  <FileText className="h-5 w-5 flex-none text-metal-400" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">{o.order_number}</p>
                    <p className="mt-0.5 text-[11px] text-metal-500">{formatDate(o.created_at)}</p>
                  </div>
                  <span className="text-right font-bold tabular-nums text-ink-900">{formatNaira(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={data.current_page} totalPages={data.total_pages} onChange={setPage} />
        </>
      )}
    </div>
  )
}
