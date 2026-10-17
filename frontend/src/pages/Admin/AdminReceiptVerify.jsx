import { BadgeCheck, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

import { AdminCard, AdminPage, PaymentPill, StatusPill } from '../../components/Admin/AdminUI'
import { errorMessage } from '../../services/api'
import { verifyAdminReceipt } from '../../services/adminApi'
import { formatDateTime, formatNaira } from '../../utils/format'

/**
 * Staff-only receipt authenticity check.
 *
 * The code printed on a receipt is derived server-side from the payment
 * facts, so a doctored receipt never verifies. And because every receipt maps
 * back to exactly one order, a genuine check also names the order's owner and
 * lists what it covered: staff can tell straight away when the person in
 * front of them — or the goods they are claiming — do not match the receipt.
 */
export default function AdminReceiptVerify() {
  const [orderNumber, setOrderNumber] = useState('')
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    const number = orderNumber.trim()
    const key = code.trim()
    if (!number || !key) {
      setError('Enter both the order number and the verification code printed on the receipt.')
      setResult(null)
      return
    }
    setError('')
    setResult(null)
    setChecking(true)
    try {
      setResult(await verifyAdminReceipt({ order_number: number, code: key }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <AdminPage
      title="Verify a receipt"
      description="Staff-only check: confirm a receipt was issued by the store, and see whose order it is and what it covered."
    >
      <AdminCard title="Receipt details">
        <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
          <label className="text-[13px] font-semibold text-ink-900">
            Order number
            <input
              className="input mt-1 font-mono uppercase"
              placeholder="TGS-260924-ABCDE"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="text-[13px] font-semibold text-ink-900">
            Verification code
            <input
              className="input mt-1 font-mono uppercase"
              placeholder="XXXX-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={checking}>
            {checking ? 'Checking…' : 'Verify'}
          </button>
        </form>
        <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-metal-500 sm:px-6">
          Every receipt is unique to one order, one customer and the items it lists. If the person presenting it does
          not match the details shown, or claims goods this receipt doesn&apos;t cover, do not accept it as proof of
          purchase.
        </p>
      </AdminCard>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {result && <VerifyResult result={result} />}
    </AdminPage>
  )
}

function VerifyResult({ result }) {
  if (!result.valid) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-5">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-red-100 text-red-700">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div>
          <p className="font-bold text-ink-900">Receipt does not verify</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-metal-600">{result.detail}</p>
        </div>
      </div>
    )
  }

  const order = result.order
  const settled = order.is_paid
  return (
    <>
      <div
        className={`flex items-start gap-3 rounded-lg border p-5 ${
          settled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        <span
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${
            settled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {settled ? <BadgeCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </span>
        <div>
          <p className="font-bold text-ink-900">
            {settled ? 'Genuine receipt' : 'Genuine code — payment does not currently stand'}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-metal-600">{result.detail}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="Issued to">
          <div className="space-y-1 p-5 text-sm">
            <p className="font-semibold text-ink-900">{order.customer_name}</p>
            <p className="text-metal-600">{order.email}</p>
            <p className="text-metal-600">{order.phone}</p>
            <p className="pt-1.5 text-xs text-metal-500">
              Order {order.order_number} · placed {formatDateTime(order.created_at)}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <StatusPill status={order.status} label={order.status_display} />
              <PaymentPill status={order.payment_status} label={order.payment_status_display} />
            </div>
          </div>
        </AdminCard>

        <AdminCard title="Payment">
          <dl className="space-y-2 p-5 text-sm">
            <Row label="Total" value={formatNaira(order.total)} strong />
            <Row label="Paid on" value={order.paid_at ? formatDateTime(order.paid_at) : '—'} />
            <Row label="Payment reference" value={order.payment_reference || '—'} />
            {order.refund_amount && (
              <Row
                label="Refunded"
                value={`${formatNaira(order.refund_amount)}${order.refunded_at ? ` on ${formatDateTime(order.refunded_at)}` : ''}`}
              />
            )}
            {order.refund_reason && <Row label="Refund reason" value={order.refund_reason} />}
          </dl>
        </AdminCard>
      </div>

      <AdminCard title={`Items on this receipt (${order.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Item</th>
                <th className="px-5 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-5 py-2.5 text-right font-semibold">Unit price</th>
                <th className="px-5 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={`${item.product_name}-${i}`} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="block text-ink-900">{item.product_name}</span>
                    {item.variant_label && <span className="text-xs text-metal-500">{item.variant_label}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatNaira(item.unit_price)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-ink-900">{formatNaira(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-metal-500">{label}</dt>
      <dd className={strong ? 'font-semibold text-ink-900' : 'text-right text-ink-800'}>{value}</dd>
    </div>
  )
}
