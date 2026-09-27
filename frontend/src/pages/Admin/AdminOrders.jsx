import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye } from 'lucide-react'

import { useToast } from '../../context/ToastContext'
import { formatNaira } from '../../utils/format'
import { fetchAdminOrders, fetchAdminOrder, setOrderStatus, setOrderPayment } from '../../services/adminApi'

const STATUSES = ['placed', 'payment_confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered', 'cancelled']
const PAYMENTS = ['pending', 'paid', 'failed', 'refunded']

export default function AdminOrders() {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [payment, setPayment] = useState('')
  const [openId, setOpenId] = useState(null)

  const params = {
    status: status || undefined,
    payment_status: payment || undefined,
    page_size: 30,
  }
  const { data, isLoading } = useQuery({ queryKey: ['admin-orders', params], queryFn: () => fetchAdminOrders(params) })
  const { data: detail } = useQuery({
    queryKey: ['admin-order', openId],
    queryFn: () => fetchAdminOrder(openId),
    enabled: Boolean(openId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-orders'] })
    qc.invalidateQueries({ queryKey: ['admin-order', openId] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }
  const statusMut = useMutation({
    mutationFn: ({ id, payload }) => setOrderStatus(id, payload),
    onSuccess: (d) => { invalidate(); toast.push(d.detail || 'Status updated.') },
    onError: (e) => toast.push(e.response?.data?.detail || 'Could not update status.'),
  })
  const paymentMut = useMutation({
    mutationFn: ({ id, payload }) => setOrderPayment(id, payload),
    onSuccess: () => { invalidate(); toast.push('Payment updated.') },
    onError: (e) => toast.push(e.response?.data?.detail || 'Could not update payment.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink-950">Orders</h1>
        <div className="flex gap-2">
          <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="input w-40" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All payments</option>
            {PAYMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-neutral-500">Loading orders…</p> : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr><th className="p-3">Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th><th /></tr>
            </thead>
            <tbody>
              {data?.results?.map((o) => (
                <tr key={o.id} className="border-t border-neutral-100">
                  <td className="p-3 font-semibold">{o.order_number}</td>
                  <td><p>{o.customer_name}</p><p className="text-xs text-neutral-500">{o.email}</p></td>
                  <td className="tabular-nums">{formatNaira(o.total)}</td>
                  <td><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold">{o.status_display}</span></td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{o.payment_status_display}</span></td>
                  <td className="p-3 text-right">
                    <button onClick={() => setOpenId(o.id)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="Manage"><Eye className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {data?.results?.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No orders match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {openId && detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Order {detail.order_number}</h2>
              <button onClick={() => setOpenId(null)} className="text-sm font-semibold text-neutral-500">Close</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-1 font-semibold">Customer</p>
                <p>{detail.customer_name}</p>
                <p className="text-neutral-500">{detail.email} · {detail.phone}</p>
                <p className="mt-2 font-semibold">Delivery</p>
                <p className="text-neutral-600">{detail.delivery_method_display}</p>
                {detail.shipping_address?.address && (
                  <p className="text-neutral-600">
                    {detail.shipping_address.address}, {detail.shipping_address.city}, {detail.shipping_address.state}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 font-semibold">Items</p>
                {detail.items?.map((i) => (
                  <p key={i.id} className="text-neutral-600">{i.quantity} × {i.product_name} — {formatNaira(i.total_price)}</p>
                ))}
                <p className="mt-2">Subtotal: <strong>{formatNaira(detail.subtotal)}</strong></p>
                <p>Shipping: <strong>{formatNaira(detail.shipping_fee)}</strong></p>
                <p>Total: <strong className="text-emerald-700">{formatNaira(detail.total)}</strong></p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-neutral-200 pt-4">
              <label className="text-sm">Status
                <select
                  className="input"
                  value={detail.status}
                  onChange={(e) => statusMut.mutate({ id: detail.id, payload: { status: e.target.value } })}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="text-sm">Payment
                <select
                  className="input"
                  value={detail.payment_status}
                  onChange={(e) => paymentMut.mutate({ id: detail.id, payload: { payment_status: e.target.value } })}
                >
                  {PAYMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Cancelling an unpaid order returns reserved stock automatically. Marking refunded returns stock too.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
