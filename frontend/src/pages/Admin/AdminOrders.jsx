import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Printer, Search, Truck, Undo2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ExportButton,
  TableFooter, exportCsv, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import useDebounce from '../../hooks/useDebounce'
import { useToast } from '../../context/ToastContext'
import { formatNaira } from '../../utils/format'
import {
  fetchAdminOrder, fetchAdminOrders, refundOrder, setOrderPayment,
  setOrderStatus, setOrderTracking,
} from '../../services/adminApi'

const STATUSES = ['placed', 'payment_confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered', 'cancelled']
const PAYMENTS = ['pending', 'paid', 'failed', 'refunded']

/**
 * Which statuses staff may pick next, mirroring the server's
 * ALLOWED_NEXT_STATUS. Offering an illegal option only to have the API reject
 * it is a worse experience than hiding it.
 */
const NEXT_STATUS = {
  placed: ['payment_confirmed', 'processing', 'cancelled'],
  payment_confirmed: ['processing', 'cancelled'],
  processing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

const pill = (tone, label) =>
  `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`

const PAYMENT_TONES = {
  paid: 'bg-emerald-100 text-emerald-700',
  refunded: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
}

const csvColumns = [
  { label: 'Order', get: (o) => o.order_number },
  { label: 'Customer', get: (o) => o.customer_name },
  { label: 'Email', get: (o) => o.email },
  { label: 'Total', get: (o) => o.total },
  { label: 'Status', get: (o) => o.status },
  { label: 'Payment', get: (o) => o.payment_status },
  { label: 'Tracking', get: (o) => o.tracking_number },
  { label: 'Date', get: (o) => o.created_at },
]

export default function AdminOrders() {
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const status = params.get('status') || ''
  const payment = params.get('payment') || ''
  const tracking = params.get('tracking') || ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const query = { page, page_size: 25 }
  if (status) query.status = status
  if (payment) query.payment_status = payment
  if (tracking) query.tracking = tracking
  if (debounced) query.search = debounced

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-orders', query],
    queryFn: () => fetchAdminOrders(query),
  })

  const [openId, setOpenId] = useState(null)

  const orders = data?.results || []

  return (
    <AdminPage
      title="Orders"
      description="Every order, with fulfilment, courier tracking and refunds."
      actions={
        <ExportButton
          onClick={() => {
            exportCsv('orders.csv', orders, csvColumns)
            toast.success(`Exported ${orders.length} order(s).`)
          }}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metal-400" />
          <input
            className="input pl-9"
            placeholder="Search order number, name, email or tracking…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="input w-auto" value={payment} onChange={(e) => setParam('payment', e.target.value)} aria-label="Filter by payment">
          <option value="">All payments</option>
          {PAYMENTS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="input w-auto" value={tracking} onChange={(e) => setParam('tracking', e.target.value)} aria-label="Filter by tracking">
          <option value="">Tracked & untracked</option>
          <option value="true">Tracked only</option>
          <option value="false">Untracked only</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-metal-500">Loading orders…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : (
        <AdminCard>
          {orders.length === 0 ? (
            <AdminEmpty>No orders match these filters.</AdminEmpty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Order</th>
                      <th className="px-4 py-2.5 font-semibold">Customer</th>
                      <th className="px-4 py-2.5 font-semibold">Total</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Payment</th>
                      <th className="px-4 py-2.5 font-semibold">Tracking</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                        <td className="px-4 py-3 font-semibold text-ink-900">{o.order_number}</td>
                        <td className="px-4 py-3">
                          <p className="text-ink-900">{o.customer_name}</p>
                          <p className="text-xs text-metal-500">{o.email}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink-900">{formatNaira(o.total)}</td>
                        <td className="px-4 py-3">{pill('bg-metal-100 text-ink-800', o.status_display)}</td>
                        <td className="px-4 py-3">{pill(PAYMENT_TONES[o.payment_status] || 'bg-metal-100 text-ink-800', o.payment_status_display)}</td>
                        <td className="px-4 py-3">
                          {o.is_tracked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                              <Truck className="h-3.5 w-3.5" /> {o.tracking_number}
                            </span>
                          ) : (
                            <span className="text-xs text-metal-400">Not tracked</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setOpenId(o.id)}
                            className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50"
                            title="Manage order"
                            aria-label={`Manage order ${o.order_number}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TableFooter page={page} pageSize={25} count={orders.length} total={data?.count} onChange={setPage} />
            </>
          )}
        </AdminCard>
      )}

      <OrderDetailModal
        id={openId}
        onClose={() => setOpenId(null)}
        invalidate={() => {
          qc.invalidateQueries({ queryKey: ['admin-orders'] })
          qc.invalidateQueries({ queryKey: ['admin-order', openId] })
          qc.invalidateQueries({ queryKey: ['admin-stats'] })
        }}
      />
    </AdminPage>
  )
}

/* ------------------------------------------------------------------ detail */

function OrderDetailModal({ id, onClose, invalidate }) {
  const { data: order, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => fetchAdminOrder(id),
    enabled: Boolean(id),
    // Retry so a single network blip does not leave staff staring at an error.
    retry: 1,
  })

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={order ? `Order ${order.order_number}` : 'Order'}
      size="max-w-3xl"
    >
      {isLoading ? (
        <p className="p-6 text-sm text-metal-500">Loading order…</p>
      ) : isError ? (
        <div className="p-6">
          <AdminError error={error} onRetry={refetch} />
        </div>
      ) : order ? (
        <OrderDetail order={order} invalidate={invalidate} />
      ) : null}
    </Modal>
  )
}

function OrderDetail({ order, invalidate }) {
  const toast = useToast()
  const [carrier, setCarrier] = useState(order.carrier || '')
  const [number, setNumber] = useState(order.tracking_number || '')
  const [refundAmount, setRefundAmount] = useState(String(order.total))
  const [refundReason, setRefundReason] = useState('')

  const statusMut = useAdminMutation({
    fn: (status) => setOrderStatus(order.id, { status }),
    success: () => 'Order status updated.',
    onDone: invalidate,
  })
  const paymentMut = useAdminMutation({
    fn: (payment_status) => setOrderPayment(order.id, { payment_status }),
    success: () => 'Payment updated.',
    onDone: invalidate,
  })
  const trackingMut = useAdminMutation({
    fn: () => setOrderTracking(order.id, { carrier, tracking_number: number }),
    success: (d) => d.detail,
    onDone: invalidate,
  })
  const shipMut = useAdminMutation({
    fn: () => setOrderTracking(order.id, { carrier, tracking_number: number, mark_shipped: true }),
    success: (d) => d.detail,
    onDone: invalidate,
  })
  const refundMut = useAdminMutation({
    fn: () =>
      refundOrder(order.id, {
        amount: Number(refundAmount),
        reason: refundReason,
      }),
    success: (d) => d.detail,
    onDone: invalidate,
  })

  const allowed = NEXT_STATUS[order.status] || []
  const canRefund = order.payment_status === 'paid'

  return (
    <div className="space-y-5 p-5">
      {/* Fulfilment */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-900">Customer</h3>
          <p className="text-sm text-ink-900">{order.customer_name}</p>
          <p className="text-[13px] text-metal-500">{order.email} · {order.phone}</p>
          {order.customer_note && (
            <p className="mt-2 rounded border border-line bg-metal-50 p-2 text-[13px] text-ink-800">
              <strong>Note:</strong> {order.customer_note}
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-900">Delivery</h3>
          <p className="text-sm text-ink-900">{order.delivery_method_display}</p>
          {order.shipping_address?.address ? (
            <p className="text-[13px] leading-relaxed text-metal-500">
              {[order.shipping_address.address, order.shipping_address.city, order.shipping_address.state, order.shipping_address.country]
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : order.pickup_location ? (
            <p className="text-[13px] text-metal-500">Collect at {order.pickup_location}</p>
          ) : null}
        </div>
      </div>

      {/* Items */}
      <div>
        <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-900">Items</h3>
        <div className="rounded-lg border border-line">
          {order.items?.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-0">
              <span className="min-w-0">
                <span className="text-ink-900">{item.quantity} × {item.product_name}</span>
                {item.variant_label && <span className="ml-1.5 text-xs text-metal-500">{item.variant_label}</span>}
              </span>
              <span className="flex-none tabular-nums text-ink-900">{formatNaira(item.total_price)}</span>
            </div>
          ))}
          <div className="space-y-1 border-t border-line bg-metal-50 px-3 py-2.5 text-sm">
            <Row label="Subtotal" value={formatNaira(order.subtotal)} />
            {Number(order.discount) > 0 && <Row label={`Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`} value={`− ${formatNaira(order.discount)}`} />}
            <Row label="Shipping" value={formatNaira(order.shipping_fee)} />
            <Row label="Total" value={formatNaira(order.total)} strong />
            {order.refund_amount && <Row label="Refunded" value={formatNaira(order.refund_amount)} strong />}
          </div>
        </div>
      </div>

      {/* Tracking */}
      <div className="rounded-lg border border-line p-3">
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-900">Courier tracking</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Carrier (e.g. GIG, DHL)" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          <input className="input" placeholder="Tracking number" value={number} onChange={(e) => setNumber(e.target.value)} />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-outline"
              disabled={trackingMut.isPending}
              onClick={() => trackingMut.mutate()}
            >
              Save
            </button>
            {order.status === 'ready_for_delivery' && (
              <button type="button" className="btn-primary" disabled={shipMut.isPending} onClick={() => shipMut.mutate()}>
                <Truck className="h-4 w-4" /> Mark shipped
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-metal-500">
          Both fields are required together. An order counts as tracked once a tracking number is saved.
        </p>
      </div>

      {/* Status + payment */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[13px] font-semibold text-ink-900">
          Status
          <select
            className="input mt-1"
            value={order.status}
            disabled={!allowed.length || statusMut.isPending}
            onChange={(e) => statusMut.mutate(e.target.value)}
          >
            <option value={order.status}>{order.status_display} (current)</option>
            {allowed.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {!allowed.length && <span className="mt-1 block text-xs font-normal text-metal-500">This is a final state.</span>}
        </label>
        <label className="text-[13px] font-semibold text-ink-900">
          Payment
          <select
            className="input mt-1"
            value={order.payment_status}
            disabled={paymentMut.isPending || order.payment_status === 'refunded'}
            onChange={(e) => paymentMut.mutate(e.target.value)}
          >
            <option value={order.payment_status}>{order.payment_status_display} (current)</option>
            {PAYMENTS.filter((p) => p !== order.payment_status && p !== 'refunded').map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Refund */}
      {canRefund && (
        <div className="rounded-lg border border-line bg-metal-50 p-3">
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-900">Refund</h3>
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <input
              className="input"
              type="number"
              min="1"
              step="0.01"
              max={order.total}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              aria-label="Refund amount"
            />
            <input
              className="input"
              placeholder="Reason (customer returned, damaged…)"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <button
              type="button"
              className="btn bg-danger text-white hover:bg-red-700"
              disabled={refundMut.isPending}
              onClick={() => refundMut.mutate()}
            >
              <Undo2 className="h-4 w-4" /> Refund
            </button>
          </div>
          <p className="mt-1.5 text-xs text-metal-500">
            Full or partial. Reserved stock is returned to inventory automatically.
          </p>
        </div>
      )}

      {order.is_refunded && (
        <p className="rounded border border-red-200 bg-red-50 p-2.5 text-[13px] text-red-700">
          Refunded {formatNaira(order.refund_amount)}
          {order.refund_reason ? ` — ${order.refund_reason}` : ''}
          {order.refunded_at ? ` on ${new Date(order.refunded_at).toLocaleDateString()}` : ''}.
        </p>
      )}

      {/* History */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-900">History</h3>
          <button type="button" onClick={() => window.print()} className="btn-ghost text-xs">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
        <ol className="space-y-1.5 border-l border-line pl-4">
          {order.history?.map((h, i) => (
            <li key={`${h.status}-${i}`} className="relative text-[13px]">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500" />
              <p className="font-semibold text-ink-900">{h.status_display}</p>
              {h.note && <p className="text-metal-500">{h.note}</p>}
              <p className="text-xs text-metal-400">{new Date(h.created_at).toLocaleString()}</p>
            </li>
          ))}
          {!order.history?.length && <li className="text-[13px] text-metal-500">No history recorded.</li>}
        </ol>
      </div>

      <p className="border-t border-line pt-3 text-xs text-metal-400">
        Customer-facing order page:{' '}
        <Link to={`/track-order?order=${order.order_number}`} className="font-semibold text-brand-600 hover:underline">
          {order.order_number}
        </Link>
      </p>
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-metal-500">{label}</span>
      <span className={strong ? 'font-semibold text-ink-900' : 'text-ink-800'}>{value}</span>
    </div>
  )
}
