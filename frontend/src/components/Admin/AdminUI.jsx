import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import Modal from '../Modal/Modal'
import Pagination from '../Pagination/Pagination'
import { errorMessage } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { cn } from '../../utils/format'

/** Page shell: heading, optional description, and a right-aligned action row. */
export function AdminPage({ title, description, actions, children }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-ink-950 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-[13px] text-metal-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function AdminCard({ title, action, children, className }) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-900">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

const TONES = {
  neutral: 'border-line bg-white',
  brand: 'border-brand-200 bg-brand-50',
  good: 'border-emerald-200 bg-emerald-50',
  warn: 'border-amber-200 bg-amber-50',
  bad: 'border-red-200 bg-red-50',
}

/** One headline number. `hint` is the sub-line; `tone` colours the card. */
export function StatCard({ label, value, hint, tone = 'neutral', icon: Icon, onClick }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 rounded-lg border p-4 text-left transition',
        TONES[tone] || TONES.neutral,
        onClick && 'hover:border-ink-900 focus-visible:border-ink-900',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-metal-500">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
        {label}
      </span>
      <span className="font-display text-2xl font-bold leading-none text-ink-950 tabular-nums">{value}</span>
      {hint && <span className="text-xs text-metal-500">{hint}</span>}
    </Wrapper>
  )
}

export function AdminError({ error, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.75} />
      <div>
        <p className="font-semibold text-ink-900">Could not load this list</p>
        <p className="mt-1 max-w-md text-[13px] text-metal-500">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  )
}

export function AdminEmpty({ children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-metal-500">{children}</p>
      {action}
    </div>
  )
}

/**
 * Confirmation dialog that replaces window.confirm/alert.
 * Returns null — use it as `confirm.delete ? <Confirm .../> : null`.
 */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onClose, busy }) {
  return (
    <Modal open={Boolean(open)} onClose={onClose} title={title} size="max-w-md">
      <div className="p-5">
        <p className="text-sm leading-relaxed text-metal-600">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={tone === 'danger' ? 'btn bg-danger text-white hover:bg-red-700' : 'btn-primary'}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Wire an admin list endpoint to pagination, CSV export and consistent
 * toasts. Every list screen used to hard-code `page_size` and render only the
 * first page, which silently hid every order past number 30.
 */
export function useAdminList(queryKey, fetcher, params = {}, { pageSize = 25, extra = {} } = {}) {
  const [page, setPage] = useState(1)
  const merged = { ...params, ...extra, page, page_size: pageSize }
  const query = useQuery({
    queryKey: [queryKey, merged],
    queryFn: () => fetcher(merged),
  })
  // Any filter change must send the reader back to page 1, or they land on an
  // out-of-range page and see an empty table.
  const reset = () => setPage(1)
  return { ...query, page, setPage: reset, goToPage: setPage, totalPages: query.data?.total_pages || 0 }
}

/** Client-side CSV of the rows currently on screen. */
export function exportCsv(filename, rows, columns) {
  if (!rows?.length) return
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escape(c.get(row))).join(',')).join('\n')
  // The BOM keeps Excel from mangling ₦ and accented names.
  const blob = new Blob([`﻿${head}\n${body}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportButton({ onClick, label = 'Export CSV' }) {
  return (
    <button type="button" onClick={onClick} className="btn-outline">
      <Download className="h-4 w-4" /> {label}
    </button>
  )
}

/** Pagination row that also reports the visible record range. */
export function TableFooter({ page, pageSize, count, total, onChange }) {
  if (!count) return null
  const from = (page - 1) * pageSize + 1
  const to = from + count - 1
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row">
      <p className="text-xs text-metal-500">
        Showing <strong className="tabular-nums">{from}</strong>–<strong className="tabular-nums">{to}</strong> of{' '}
        <strong className="tabular-nums">{total ?? count}</strong>
      </p>
      <div className="-mt-12 md:mt-0">
        <Pagination page={page} totalPages={Math.ceil((total ?? count) / pageSize)} onChange={onChange} />
      </div>
    </div>
  )
}

/** Shared mutation wiring: toast on both outcomes, invalidate on success. */
export function useAdminMutation({ fn, success, invalidate = [], onDone }) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      if (success) toast.success(typeof success === 'function' ? success(data) : success)
      onDone?.(data)
    },
    onError: (e) => toast.error(errorMessage(e, 'That action did not complete.')),
  })
}
