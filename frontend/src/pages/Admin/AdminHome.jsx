import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Star, Mail } from 'lucide-react'

import { fetchStats } from '../../services/adminApi'
import { formatNaira } from '../../utils/format'

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent || 'text-ink-950'}`}>{value}</p>
    </div>
  )
}

export default function AdminHome() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['admin-stats'], queryFn: fetchStats })

  if (isLoading) return <p className="text-sm text-neutral-500">Loading dashboard…</p>
  if (!stats) return <p className="text-sm text-neutral-500">Could not load stats.</p>

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-ink-950">Store overview</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue (month)" value={formatNaira(stats.revenue?.this_month || 0)} accent="text-emerald-700" />
        <Stat label="Revenue (today)" value={formatNaira(stats.revenue?.today || 0)} />
        <Stat label="Orders" value={stats.orders?.total ?? 0} />
        <Stat label="Awaiting payment" value={stats.orders?.awaiting_payment ?? 0} accent="text-amber-600" />
        <Stat label="Products" value={`${stats.products?.active ?? 0} active / ${stats.products?.total ?? 0}`} />
        <Stat label="Customers" value={stats.customers ?? 0} />
        <Stat label="Low / out of stock" value={`${stats.products?.low_stock ?? 0} / ${stats.products?.out_of_stock ?? 0}`} accent="text-red-600" />
        <Stat label="Pending reviews" value={stats.reviews_pending ?? 0} accent="text-purple-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-950">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Awaiting payment</span><Link to="/admin/orders" className="font-semibold text-blue-600">{stats.orders?.awaiting_payment ?? 0}</Link></li>
            <li className="flex justify-between"><span>Out of stock</span><Link to="/admin/products" className="font-semibold text-blue-600">{stats.products?.out_of_stock ?? 0}</Link></li>
            <li className="flex justify-between"><span>Unresolved messages</span><Link to="/admin/messages" className="font-semibold text-blue-600">{stats.messages_unresolved ?? 0}</Link></li>
          </ul>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-950">
            <Star className="h-4 w-4 text-amber-500" /> Top products (by units sold)
          </h2>
          {stats.top_products?.length ? (
            <ul className="space-y-2 text-sm">
              {stats.top_products.map((p) => (
                <li key={p.items__product__id} className="flex justify-between gap-3">
                  <span className="truncate">{p.items__product__name}</span>
                  <span className="flex-none font-semibold tabular-nums">{p.units} sold</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No paid orders yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-950">
            <Mail className="h-4 w-4 text-blue-500" /> Recent orders
          </h2>
          <Link to="/admin/orders" className="text-xs font-semibold text-blue-600">View all</Link>
        </div>
        {stats.recent_orders?.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr><th className="py-2">Order</th><th>Customer</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {stats.recent_orders.map((o) => (
                <tr key={o.id} className="border-t border-neutral-100">
                  <td className="py-2 font-semibold">{o.order_number}</td>
                  <td>{o.customer_name}</td>
                  <td className="tabular-nums">{formatNaira(o.total)}</td>
                  <td><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold">{o.status_display}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">No orders yet — they will appear here as customers check out.</p>
        )}
      </div>
    </div>
  )
}
