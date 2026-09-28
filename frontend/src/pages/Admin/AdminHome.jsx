import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Banknote, Boxes, CheckCircle2, Mail, Package,
  PackageCheck, Truck, Users,
} from 'lucide-react'

import { AdminCard, AdminError, AdminPage, StatCard } from '../../components/Admin/AdminUI'
import { fetchStats } from '../../services/adminApi'
import { formatNaira } from '../../utils/format'

const pill = (tone, label) =>
  `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`

export default function AdminHome() {
  const navigate = useNavigate()
  const { data: stats, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: fetchStats,
  })

  if (isLoading) return <p className="text-sm text-metal-500">Loading dashboard…</p>
  if (isError) return <AdminError error={error} onRetry={refetch} />
  if (!stats) return null

  const o = stats.orders || {}
  const p = stats.products || {}
  const c = stats.customers || {}
  const go = (to) => navigate(to)

  return (
    <AdminPage
      title="Store overview"
      description="Everything that needs a decision today, then the numbers behind it."
    >
      {/* Money in */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue this month" value={formatNaira(stats.revenue?.this_month || 0)} tone="good" icon={Banknote} />
        <StatCard label="Revenue today" value={formatNaira(stats.revenue?.today || 0)} icon={Banknote} />
        <StatCard label="Average order" value={formatNaira(stats.revenue?.average_order || 0)} icon={Banknote} />
        <StatCard label="Paid orders" value={o.paid ?? 0} hint={`${o.awaiting_payment ?? 0} awaiting payment`} tone="good" icon={PackageCheck} onClick={() => go('/admin/orders?payment=paid')} />
      </div>

      {/* Fulfilment */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="All orders" value={o.total ?? 0} icon={Package} onClick={() => go('/admin/orders')} />
        <StatCard label="Delivered" value={o.delivered ?? 0} tone="good" icon={PackageCheck} onClick={() => go('/admin/orders?status=delivered')} />
        <StatCard label="In progress" value={o.pending ?? 0} hint={`${o.ready_to_ship ?? 0} ready to ship`} tone="warn" icon={Truck} onClick={() => go('/admin/orders')} />
        <StatCard label="Refunded" value={o.refunded ?? 0} hint={`${o.cancelled ?? 0} cancelled`} tone={o.refunded ? 'bad' : 'neutral'} icon={AlertTriangle} onClick={() => go('/admin/orders?payment=refunded')} />
      </div>

      {/* The tracked / untracked split the store actually works from */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Tracked parcels"
          value={o.tracked ?? 0}
          hint="Have a courier reference"
          tone="brand"
          icon={Truck}
          onClick={() => go('/admin/orders?tracking=true')}
        />
        <StatCard
          label="Not yet tracked"
          value={o.untracked ?? 0}
          hint="Still waiting on a courier reference"
          tone={o.untracked ? 'warn' : 'neutral'}
          icon={Package}
          onClick={() => go('/admin/orders?tracking=false')}
        />
      </div>

      {/* Catalogue and people */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active products" value={p.active ?? 0} hint={`${p.archived ?? 0} archived`} icon={Boxes} onClick={() => go('/admin/products')} />
        <StatCard
          label="Low stock"
          value={p.low_stock ?? 0}
          hint={`At or under ${p.low_stock_threshold ?? 5} units`}
          tone={p.low_stock ? 'warn' : 'neutral'}
          icon={AlertTriangle}
          onClick={() => go('/admin/products?low_stock=true')}
        />
        <StatCard label="Out of stock" value={p.out_of_stock ?? 0} tone={p.out_of_stock ? 'bad' : 'neutral'} icon={Boxes} onClick={() => go('/admin/products?availability=out_of_stock')} />
        <StatCard label="Customers" value={c.total ?? 0} hint={`${c.new_this_month ?? 0} new this month`} icon={Users} onClick={() => go('/admin/customers')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Restock worklist — the items about to run out, worst first. */}
        <AdminCard
          title="Almost out of stock"
          action={<Link to="/admin/products" className="text-xs font-semibold text-brand-600">Manage</Link>}
        >
          {p.low_stock_items?.length ? (
            <ul className="divide-y divide-line">
              {p.low_stock_items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/admin/products?search=${encodeURIComponent(item.sku || item.name)}`} className="block truncate text-[13px] font-semibold text-ink-900 hover:underline">
                      {item.name}
                    </Link>
                    <p className="text-xs text-metal-500">{formatNaira(item.price)}</p>
                  </div>
                  {pill(item.stock_quantity <= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700', `${item.stock_quantity} left`)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-metal-500">Nothing is running low right now.</p>
          )}
        </AdminCard>

        <div className="space-y-4">
          <AdminCard title="Needs attention">
            <ul className="divide-y divide-line text-sm">
              <AttentionRow label="Awaiting payment" to="/admin/orders?payment=pending" value={o.awaiting_payment ?? 0} />
              <AttentionRow label="Ready to ship" to="/admin/orders?status=ready_for_delivery" value={o.ready_to_ship ?? 0} />
              <AttentionRow label="Out of stock" to="/admin/products?availability=out_of_stock" value={p.out_of_stock ?? 0} />
              <AttentionRow label="Pending reviews" to="/admin/reviews?is_approved=false" value={stats.reviews_pending ?? 0} />
              <AttentionRow label="Unresolved messages" to="/admin/messages?is_resolved=false" value={stats.messages_unresolved ?? 0} />
            </ul>
          </AdminCard>

          <AdminCard title="Top products (by units sold)">
            {stats.top_products?.length ? (
              <ul className="divide-y divide-line">
                {stats.top_products.map((row) => (
                  <li key={row.items__product__id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-ink-900">{row.items__product__name}</span>
                    <span className="flex-none font-semibold tabular-nums text-ink-900">{row.units} sold</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-metal-500">No paid orders yet.</p>
            )}
          </AdminCard>
        </div>
      </div>

      <AdminCard
        title="Recent orders"
        action={<Link to="/admin/orders" className="text-xs font-semibold text-brand-600">View all</Link>}
      >
        {stats.recent_orders?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Order</th>
                  <th className="px-4 py-2 font-semibold">Customer</th>
                  <th className="px-4 py-2 font-semibold">Total</th>
                  <th className="px-4 py-2 font-semibold">Payment</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Tracking</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_orders.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ink-900">{row.order_number}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-ink-900">{row.customer_name}</p>
                      <p className="text-xs text-metal-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-900">{formatNaira(row.total)}</td>
                    <td className="px-4 py-2.5">{paymentPill(row.payment_status, row.payment_status_display)}</td>
                    <td className="px-4 py-2.5">{pill('bg-metal-100 text-ink-800', row.status_display)}</td>
                    <td className="px-4 py-2.5">
                      {row.is_tracked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                          <Truck className="h-3.5 w-3.5" /> {row.tracking_number}
                        </span>
                      ) : (
                        <span className="text-xs text-metal-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Mail className="h-5 w-5 text-metal-300" />
            <p className="text-sm text-metal-500">No orders yet — they will appear here as customers check out.</p>
          </div>
        )}
      </AdminCard>
    </AdminPage>
  )
}

function AttentionRow({ label, to, value }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-ink-800">{label}</span>
      {value > 0 ? (
        <Link to={to} className="inline-flex items-center gap-1 font-semibold tabular-nums text-brand-600 hover:underline">
          {value} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> clear
        </span>
      )}
    </li>
  )
}

export function paymentPill(status, label) {
  const tones = {
    paid: 'bg-emerald-100 text-emerald-700',
    refunded: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
  }
  return pill(tones[status] || 'bg-metal-100 text-ink-800', label || status)
}
