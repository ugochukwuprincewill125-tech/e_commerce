import { useQuery } from '@tanstack/react-query'
import { Download, PackageX, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import { useToast } from '../../context/ToastContext'
import { formatDate, formatDateTime, formatNaira } from '../../utils/format'
import { downloadReceiptPdf } from '../../utils/receiptPdf'
import { orderService } from '../../services/orderService'

export default function ReceiptDetail() {
  const { reference } = useParams()
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)
  const { data: r, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['receipt', reference],
    queryFn: () => orderService.receipt(reference),
    retry: 1,
    gcTime: 30_000,
  })

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      downloadReceiptPdf(r)
      toast.success('Receipt downloaded', 'Saved as receipt-' + r.order_number + '.pdf')
    } catch (e) {
      console.error(e)
      toast.error('Download failed', 'Your browser blocked the PDF. Allow downloads for this site or use Print → Save as PDF.')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    )
  if (isError) {
    if (error?.response?.status === 404)
      return (
        <EmptyState
          icon={PackageX}
          title="Receipt not found"
          message="We couldn't find that receipt."
          action={{ label: 'All receipts', to: '/account/receipts' }}
        />
      )
    return <ErrorState onRetry={refetch} />
  }

  const addressParts = r.shipping_address || {}
  const address =
    r.delivery_method === 'pickup'
      ? r.pickup_location
      : [addressParts.address, addressParts.city, addressParts.state, addressParts.country, addressParts.postal_code]
          .filter(Boolean)
          .join(', ')

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/account/receipts" className="text-[13px] font-semibold text-metal-500 hover:text-ink-900">
          &larr; All receipts
        </Link>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            type="button"
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-ink-800 hover:border-ink-900 hover:text-ink-900 disabled:opacity-60"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          <button
            onClick={handlePrint}
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-ink-800 hover:border-ink-900 hover:text-ink-900"
          >
            <Printer className="h-4 w-4" strokeWidth={1.75} />
            Print
          </button>
        </div>
      </div>

      <div className="receipt printable card p-6 sm:p-8">
        <div className="flex justify-between">
          <div>
            <h3 className="text-xl font-bold text-ink-900">Timeline Gadgets</h3>
            <p className="mt-1 text-sm text-metal-600">Receipt</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-metal-600">Receipt #{r.order_number}</p>
            <p className="text-sm text-metal-600">Date: {formatDate(r.created_at)}</p>
            <p className="text-sm text-metal-600">Time: {formatDateTime(r.created_at)}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4 text-sm">
          <p className="font-semibold text-ink-800">Bill to</p>
          <p className="mt-1 text-ink-900">{r.first_name} {r.last_name}</p>
          <p className="text-metal-600">{r.email}</p>
          <p className="text-metal-600">{r.phone}</p>
          {address && <p className="text-metal-600">{address}</p>}
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-metal-600">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Price</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metal-100">
              {r.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2">{it.product_name}{it.variant_label ? ` (${it.variant_label})` : ''}</td>
                  <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{formatNaira(it.unit_price)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNaira(it.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <div className="flex justify-between py-1 text-sm">
            <span className="text-metal-600">Subtotal</span>
            <span>{formatNaira(r.subtotal)}</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-metal-600">{r.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}</span>
            <span>{Number(r.shipping_fee) ? formatNaira(r.shipping_fee) : 'Free'}</span>
          </div>
          {Number(r.discount) > 0 && (
            <div className="flex justify-between py-1 text-sm text-success">
              <span>Discount{r.coupon_code ? ` (${r.coupon_code})` : ''}</span>
              <span>-{formatNaira(r.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <span>Total</span>
            <span>{formatNaira(r.total)}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4 text-xs text-metal-600">
          <p>Payment reference: {r.payment_reference}</p>
          <p>Paid on: {formatDateTime(r.paid_at)}</p>
          {r.verification_code && (
            <div className="mt-3">
              <p className="font-semibold uppercase tracking-wide text-ink-800">Verification code</p>
              <p className="mt-1 inline-block rounded-lg border border-line bg-metal-50 px-3 py-1.5 font-mono text-[14px] font-semibold tracking-widest text-ink-900">
                {r.verification_code}
              </p>
              <p className="mt-1.5">
                Anyone can confirm this receipt is genuinely ours — check this code with the order number at{' '}
                <Link to="/receipt-verify" className="font-semibold text-brand-700 hover:text-brand-800">/receipt-verify</Link>. A fake receipt fails that check.
              </p>
            </div>
          )}
        </div>

        <div className="print:hidden mt-6 border-t border-line pt-4 text-center text-xs text-metal-500">
          <p>Thank you for shopping with Timeline Gadgets!</p>
        </div>
      </div>
    </div>
  )
}
