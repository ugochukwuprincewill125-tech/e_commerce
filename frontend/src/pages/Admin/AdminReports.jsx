import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp } from 'lucide-react'

import {
  AdminCard, AdminError, AdminEmpty, AdminPage, ExportButton, StatCard, exportCsv,
} from '../../components/Admin/AdminUI'
import { fetchAdminReports } from '../../services/adminApi'
import { formatNaira } from '../../utils/format'

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
]

export default function AdminReports() {
  const [days, setDays] = useState(30)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-reports', days],
    queryFn: () => fetchAdminReports({ days }),
  })

  if (isLoading) return <p className="text-sm text-metal-500">Building the report…</p>
  if (isError) return <AdminError error={error} onRetry={refetch} />
  if (!data) return null

  const t = data.totals
  const peak = Math.max(...data.series.map((d) => d.revenue), 1)

  const seriesCsv = data.series.map((d) => ({ ...d }))

  return (
    <AdminPage
      title="Reports"
      description="How the store is trading over the selected window."
      actions={
        <>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={days === r.days ? 'btn-primary' : 'btn-outline'}
              >
                {r.label}
              </button>
            ))}
          </div>
          <ExportButton onClick={() => exportCsv(`sales-${days}d.csv`, seriesCsv, [
            { label: 'Date', get: (r) => r.date },
            { label: 'Revenue', get: (r) => r.revenue },
            { label: 'Orders', get: (r) => r.orders },
          ])} />
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatNaira(t.revenue)} tone="good" icon={TrendingUp} />
        <StatCard label="Orders" value={t.orders} hint={`${t.paid_orders} paid`} />
        <StatCard label="Average order" value={formatNaira(t.average_order)} />
        <StatCard label="Units sold" value={t.units} />
      </div>

      {Number(t.discount_given) > 0 && (
        <p className="text-[13px] text-metal-500">
          Coupons gave away <strong className="text-ink-900">{formatNaira(t.discount_given)}</strong> in this window.
        </p>
      )}

      <AdminCard title={`Revenue by day (${RANGES.find((r) => r.days === days)?.label.toLowerCase()})`}>
        {data.series.length === 0 ? (
          <AdminEmpty>No sales in this window.</AdminEmpty>
        ) : (
          <>
            <div className="flex h-48 items-end gap-[2px] px-4 py-4" role="img" aria-label="Daily revenue">
              {data.series.map((d) => (
                <div
                  key={d.date}
                  className="group relative flex-1 bg-brand-500/80 transition hover:bg-brand-600"
                  style={{ height: `${Math.max((d.revenue / peak) * 100, d.revenue > 0 ? 2 : 0.5)}%` }}
                  title={`${d.date}: ${formatNaira(d.revenue)} across ${d.orders} order(s)`}
                />
              ))}
            </div>
            <div className="flex justify-between border-t border-line px-4 py-2 text-xs text-metal-500">
              <span>{data.series[0]?.date}</span>
              <span>peak {formatNaira(peak)}</span>
              <span>{data.series[data.series.length - 1]?.date}</span>
            </div>
          </>
        )}
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="Best sellers">
          {data.best_sellers.length === 0 ? (
            <AdminEmpty>No sales in this window.</AdminEmpty>
          ) : (
            <ol className="divide-y divide-line">
              {data.best_sellers.map((row, i) => (
                <li key={row.items__product__id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-5 flex-none tabular-nums text-xs font-bold text-metal-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-900">{row.items__product__name}</span>
                  <span className="flex-none tabular-nums text-ink-900">{row.units}</span>
                  <span className="w-24 flex-none text-right tabular-nums text-metal-500">{formatNaira(row.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </AdminCard>

        <AdminCard title="Best customers">
          {data.best_customers.length === 0 ? (
            <AdminEmpty>No orders in this window.</AdminEmpty>
          ) : (
            <ol className="divide-y divide-line">
              {data.best_customers.map((row) => (
                <li key={row.user_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink-900">{`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email}</span>
                    <span className="block truncate text-xs text-metal-500">{row.email}</span>
                  </span>
                  <span className="flex-none text-right">
                    <span className="block tabular-nums text-ink-900">{formatNaira(row.spend)}</span>
                    <span className="block text-xs text-metal-500">{row.orders} orders</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </AdminCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="By status" data={data.by_status} />
        <Breakdown title="By payment" data={data.by_payment} />
        <Breakdown title="By delivery method" data={data.by_delivery_method} />
      </div>

      <AdminCard title="Coupon performance">
        {data.coupon_performance.length === 0 ? (
          <AdminEmpty>No coupons were used in this window.</AdminEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold">Orders</th>
                  <th className="px-4 py-2.5 font-semibold">Discount given</th>
                  <th className="px-4 py-2.5 font-semibold">Order value</th>
                </tr>
              </thead>
              <tbody>
                {data.coupon_performance.map((row) => (
                  <tr key={row.coupon_code} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink-900">{row.coupon_code}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-900">{row.orders}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-900">{formatNaira(row.discount)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-900">{formatNaira(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPage>
  )
}

const prettify = (key) =>
  key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function Breakdown({ title, data }) {
  const entries = Object.entries(data || {})
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <AdminCard title={title}>
      {entries.length === 0 ? (
        <AdminEmpty>Nothing in this window.</AdminEmpty>
      ) : (
        <ul className="space-y-2.5 p-4">
          {entries.map(([key, value]) => (
            <li key={key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-ink-800">
                  <BarChart3 className="h-3.5 w-3.5 text-metal-400" />
                  {prettify(key)}
                </span>
                <span className="tabular-nums font-semibold text-ink-900">{value}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-metal-100">
                <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  )
}
