import { jsPDF } from 'jspdf'

/**
 * Renders a paid order as a downloadable PDF receipt.
 *
 * Drawn with jsPDF primitives (not a canvas screenshot) so the text stays
 * crisp, scalable and selectable. The ₦ glyph is outside the built-in PDF
 * fonts' latin1 range, so amounts are labelled "NGN" instead.
 */

const NGN = (value) => `NGN ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const LINE = [64, 64, 64] // grey
const MUTED = [130, 130, 130]
const INK = [17, 17, 17]

export function buildReceiptPdf(r) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 56 // margins
  const rowH = 20

  let y = M

  const text = (str, x, opts = {}) => doc.text(String(str ?? ''), x, y, opts)
  const colour = (c) => doc.setTextColor(c[0], c[1], c[2])
  const hr = () => {
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(1)
    doc.line(M, y, pageW - M, y)
  }
  const ensureRoom = (needed) => {
    if (y + needed > pageH - M) {
      doc.addPage()
      y = M
    }
  }

  // Letterhead
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  colour(INK)
  text('Timeline Gadgets', M)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  colour(MUTED)
  text('Payment receipt', pageW - M, { align: 'right' })
  y += 24
  hr()
  y += 28

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  colour(INK)
  text(`Receipt #${r.order_number}`, M)
  doc.setFont('helvetica', 'normal')
  colour(LINE)
  const right = (label, value) => {
    text(label, pageW - M - 160)
    text(value, pageW - M, { align: 'right' })
  }
  right('Date:', new Date(r.created_at).toLocaleString('en-NG'))
  y += 16
  right('Payment ref:', r.payment_reference || '—')
  y += 16
  right('Paid on:', r.paid_at ? new Date(r.paid_at).toLocaleString('en-NG') : new Date(r.created_at).toLocaleString('en-NG'))
  y += 30

  // Bill to
  doc.setFont('helvetica', 'bold')
  colour(INK)
  text('Bill to', M)
  y += 16
  doc.setFont('helvetica', 'normal')
  colour(LINE)
  const billLines = [
    [r.first_name, r.last_name].filter(Boolean).join(' '),
    r.email,
    r.phone,
    r.delivery_method === 'pickup'
      ? `Pickup — ${r.pickup_location}`.trim()
      : [r.shipping_address?.address, r.shipping_address?.city, r.shipping_address?.state, r.shipping_address?.country].filter(Boolean).join(', '),
  ].filter(Boolean)
  billLines.forEach((line) => {
    doc.splitTextToSize(line, 320).forEach((part) => {
      text(part, M)
      y += 13
    })
  })
  y += 18

  // Items table
  ensureRoom(rowH * 2 + 40)
  doc.setFont('helvetica', 'bold')
  colour(INK)
  hr()
  y += 16
  const colItem = M
  const colQty = pageW - M - 240
  const colPrice = pageW - M - 120
  const colTotal = pageW - M
  text('Item', colItem)
  text('Qty', colQty, { align: 'right' })
  text('Price', colPrice, { align: 'right' })
  text('Total', colTotal, { align: 'right' })
  y += 6
  hr()
  y += 16

  doc.setFont('helvetica', 'normal')
  colour(LINE)
  ;(r.items || []).forEach((it) => {
    const lines = doc.splitTextToSize(
      `${it.product_name}${it.variant_label ? ` (${it.variant_label})` : ''}`,
      colQty - colItem - 12,
    )
    const need = lines.length * 13 + 7
    ensureRoom(need)
    lines.forEach((line, i) => text(line, colItem + (i === 0 ? 0 : 10)))
    text(String(it.quantity), colQty, { align: 'right' })
    text(NGN(it.unit_price), colPrice, { align: 'right' })
    text(NGN(it.total_price), colTotal, { align: 'right' })
    y += 6
    hr()
    y += 16
  })

  // Totals
  ensureRoom(90)
  const totalRow = (label, value, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    colour(bold ? INK : LINE)
    text(label, pageW - M - 220)
    text(value, pageW - M, { align: 'right' })
    y += 18
  }
  totalRow('Subtotal', NGN(r.subtotal))
  totalRow(r.delivery_method === 'pickup' ? 'Pickup' : 'Delivery', Number(r.shipping_fee) ? NGN(r.shipping_fee) : 'Free')
  if (Number(r.discount) > 0) totalRow(`Discount${r.coupon_code ? ` (${r.coupon_code})` : ''}`, `- ${NGN(r.discount)}`)
  doc.setFont('helvetica', 'bold')
  colour(INK)
  text('Total', pageW - M - 220)
  text(NGN(r.total), pageW - M, { align: 'right' })
  y += 30

  // Footer + anti-forgery verification block
  ensureRoom(110)
  hr()
  y += 18
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  colour(INK)
  text('VERIFY THIS RECEIPT', M)
  y += 14
  doc.setFont('helvetica', 'normal')
  colour(LINE)
  text('Check the code below with the order number at our receipt-verify page.', M)
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  colour(INK)
  text(`Code: ${r.verification_code || '—'}`, M)
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://timeline-gadgets.com'
  text(`${origin}/receipt-verify`, pageW - M, { align: 'right' })
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  colour(MUTED)
  text('A receipt that does not verify did not come from us. Thank you for shopping with Timeline Gadgets!', M)

  return doc
}

export function downloadReceiptPdf(receipt) {
  const doc = buildReceiptPdf(receipt)
  doc.save(`receipt-${receipt.order_number}.pdf`)
}
