import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Banknote, Boxes, CheckCircle2, Package,
  PackageCheck, ReceiptText, Truck, Users,
} from 'lucide-react'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, AdminSection,
  PaymentPill, StatCard, StatusPill,
} from '../../components/Admin/AdminUI'
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
      description="The numbers behind the store, grouped by the decisions they feed."
    >
      {/* ------------------------------------------------------------ money */}
      <AdminSection icon={Banknote} title="Money">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Revenue this month" value={formatNaira(stats.revenue?.this_month || 0)} tone="good" icon={Banknote} />
          <StatCard label="Revenue today" value={formatNaira(stats.revenue?.today || 0)} icon={Banknote} />
          <StatCard label="Average order" value={formatNaira(stats.revenue?.average_order || 0)} icon={Banknote} />
          <StatCard
            label="Paid orders"
            value={o.paid ?? 0}
            hint={`${o.awaiting_payment ?? 0} awaiting payment`}
            icon={PackageCheck}
            onClick={() => go('/admin/orders?payment=paid')}
          />
        </div>
      </AdminSection>

      {/* ------------------------------------------------------- fulfilment */}
      <AdminSection
        icon={Truck}
        title="Fulfilment"
        action={<Link to="/admin/orders" className="text-xs font-semibold text-brand-600 hover:underline">All orders →</Link>}
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="All orders" value={o.total ?? 0} icon={Package} onClick={() => go('/admin/orders')} />
          <StatCard
            label="In progress"
            value={o.pending ?? 0}
            hint={`${o.ready_to_ship ?? 0} ready to ship`}
            tone="warn"
            icon={Truck}
            onClick={() => go('/admin/orders')}
          />
          <StatCard label="Delivered" value={o.delivered ?? 0} tone="good" icon={PackageCheck} onClick={() => go('/admin/orders?status=delivered')} />
          <StatCard
            label="Refunded"
            value={o.refunded ?? 0}
            hint={`${o.cancelled ?? 0} cancelled`}
            tone={o.refunded ? 'bad' : 'neutral'}
            icon={AlertTriangle}
            onClick={() => go('/admin/orders?payment=refunded')}
          />
        </div>

        {/* The tracked / untracked split staff actually work from, kept
            apart from the status counts above so the two questions never
            blur together. */}
        <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
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
      </AdminSection>

      {/* ----------------------------------------------- catalogue & people */}
      <AdminSection icon={Boxes} title="Catalogue & customers">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
      </AdminSection>

      {/* ------------------------------------------------------- work queue */}
      <AdminSection icon={AlertTriangle} title="Work queue">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Restock worklist — the items about to run out, worst first. */}
          <AdminCard
            title="Almost out of stock"
            action={<Link to="/admin/products" className="text-xs font-semibold text-brand-600">Manage</Link>}
          >
            {p.low_stock_items?.length ? (
              <ul className="divide-y divide-line">
                {p.low_stock_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
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
              <AdminEmpty>Nothing is running low right now.</AdminEmpty>
            )}
          </AdminCard>

          <AdminCard title="Needs attention">
            <ul className="divide-y divide-line text-sm">
              <AttentionRow label="Awaiting payment" to="/admin/orders?payment=pending" value={o.awaiting_payment ?? 0} />
              <AttentionRow label="Ready to ship" to="/admin/orders?status=ready_for_delivery" value={o.ready_to_ship ?? 0} />
              <AttentionRow label="Out of stock" to="/admin/products?availability=out_of_stock" value={p.out_of_stock ?? 0} />
              <AttentionRow label="Pending reviews" to="/admin/reviews?is_approved=false" value={stats.reviews_pending ?? 0} />
              <AttentionRow label="Unresolved messages" to="/admin/messages?is_resolved=false" value={stats.messages_unresolved ?? 0} />
            </ul>
          </AdminCard>

          <AdminCard title="Top sellers">
            {stats.top_products?.length ? (
              <ol className="divide-y divide-line">
                {stats.top_products.map((row, i) => (
                  <li key={row.items__product__id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-4 flex-none tabular-nums text-xs font-bold text-metal-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-900">{row.items__product__name}</span>
                    <span className="flex-none font-semibold tabular-nums text-ink-900">{row.units} sold</span>
                  </li>
                ))}
              </ol>
            ) : (
              <AdminEmpty>No paid orders yet.</AdminEmpty>
            )}
          </AdminCard>
        </div>
      </AdminSection>

      {/* ------------------------------------------------- recent activity */}
      <AdminSection
        icon={ReceiptText}
        title="Recent orders"
        action={<Link to="/admin/orders" className="text-xs font-semibold text-brand-600 hover:underline">View all →</Link>}
      >
        <AdminCard>
          {stats.recent_orders?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Order</th>
                    <th className="px-5 py-2.5 font-semibold">Customer</th>
                    <th className="px-5 py-2.5 font-semibold">Total</th>
                    <th className="px-5 py-2.5 font-semibold">Payment</th>
                    <th className="px-5 py-2.5 font-semibold">Status</th>
                    <th className="px-5 py-2.5 font-semibold">Tracking</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_orders.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                      <td className="px-5 py-3 font-semibold text-ink-900">{row.order_number}</td>
                      <td className="px-5 py-3">
                        <p className="text-ink-900">{row.customer_name}</p>
                        <p className="text-xs text-metal-500">{row.email}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-ink-900">{formatNaira(row.total)}</td>
                      <td className="px-5 py-3"><PaymentPill status={row.payment_status} label={row.payment_status_display} /></td>
                      <td className="px-5 py-3"><StatusPill status={row.status} label={row.status_display} /></td>
                      <td className="px-5 py-3">
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
            <AdminEmpty>No orders yet — they will appear here as customers check out.</AdminEmpty>
          )}
        </AdminCard>
      </AdminSection>
    </AdminPage>
  )
}

function AttentionRow({ label, to, value }) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
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
