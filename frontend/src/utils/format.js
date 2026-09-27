const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function formatNaira(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return '₦0'
  return naira.format(n).replace('NGN', '₦').replace(/\s/g, '')
}

export function formatDate(value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-NG', opts).format(new Date(value))
}

export function formatDateTime(value) {
  return formatDate(value, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function pluralize(count, word, plural = `${word}s`) {
  return `${count} ${count === 1 ? word : plural}`
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ')
}

export const cn = classNames
