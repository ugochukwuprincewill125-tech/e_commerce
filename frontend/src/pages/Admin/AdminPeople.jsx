import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'

import { useToast } from '../../context/ToastContext'
import { formatNaira } from '../../utils/format'
import {
  fetchAdminCustomers, setCustomerActive,
  fetchAdminReviews, approveAdminReview, deleteAdminReview,
  fetchAdminMessages, resolveAdminMessage,
} from '../../services/adminApi'

export function AdminCustomers() {
  const toast = useToast()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['admin-customers', search],
    queryFn: () => fetchAdminCustomers({ search: search || undefined, page_size: 30 }),
  })

  const toggle = useMutation({
    mutationFn: ({ id, active }) => setCustomerActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-customers'] }),
    onError: (e) => toast.push(e.response?.data?.detail || 'Could not update the customer.'),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ink-950">Customers</h1>
      <input className="input max-w-xs" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr><th className="p-3">Customer</th><th>Joined</th><th>Orders</th><th>Total spent</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data?.results?.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="p-3"><p className="font-semibold">{c.full_name || '—'}</p><p className="text-xs text-neutral-500">{c.email}</p></td>
                  <td>{new Date(c.date_joined).toLocaleDateString()}</td>
                  <td className="tabular-nums">{c.order_count}</td>
                  <td className="tabular-nums">{formatNaira(c.total_spent)}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {c.is_active ? 'active' : 'blocked'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggle.mutate({ id: c.id, active: !c.is_active })}
                      className={`btn-outline px-3 py-1 text-xs ${c.is_active ? 'text-red-600' : 'text-emerald-700'}`}
                    >
                      {c.is_active ? 'Block' : 'Unblock'}
                    </button>
                  </td>
                </tr>
              ))}
              {data?.results?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AdminReviews() {
  const toast = useToast()
  const qc = useQueryClient()
  const [filter, setFilter] = useState('pending')
  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', filter],
    queryFn: () => fetchAdminReviews({ is_approved: filter === 'approved' ? 'true' : 'false', page_size: 30 }),
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-reviews'] })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-950">Reviews</h1>
        <div className="flex gap-2 text-sm">
          {['pending', 'approved'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 font-semibold ${filter === f ? 'bg-ink-950 text-white' : 'bg-neutral-100'}`}>{f}</button>
          ))}
        </div>
      </div>
      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="space-y-3">
          {data?.results?.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {r.product_name}</p>
                  <p className="text-xs text-neutral-500">by {r.customer_name} ({r.customer_email}) · {new Date(r.created_at).toLocaleDateString()}</p>
                  <p className="mt-2 text-sm text-neutral-700">{r.comment}</p>
                </div>
                <div className="flex flex-none gap-2">
                  <button
                    onClick={() => approveAdminReview(r.id, !r.is_approved).then(invalidate)}
                    className="btn-outline flex items-center gap-1 px-3 py-1 text-xs"
                  >
                    {r.is_approved ? <><X className="h-3.5 w-3.5" /> Unpublish</> : <><Check className="h-3.5 w-3.5" /> Approve</>}
                  </button>
                  <button
                    onClick={() => deleteAdminReview(r.id).then(invalidate)}
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                  ><X className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {data?.results?.length === 0 && <p className="text-sm text-neutral-500">Nothing here right now.</p>}
        </div>
      )}
    </div>
  )
}

export function AdminMessages() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('open')
  const { data, isLoading } = useQuery({
    queryKey: ['admin-messages', filter],
    queryFn: () => fetchAdminMessages({ is_resolved: filter === 'resolved' ? 'true' : 'false', page_size: 30 }),
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-messages'] })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-950">Messages</h1>
        <div className="flex gap-2 text-sm">
          {['open', 'resolved'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 font-semibold ${filter === f ? 'bg-ink-950 text-white' : 'bg-neutral-100'}`}>{f}</button>
          ))}
        </div>
      </div>
      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="space-y-3">
          {data?.results?.map((m) => (
            <div key={m.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{m.subject}</p>
                  <p className="text-xs text-neutral-500">{m.name} · {m.email} · {m.phone || 'no phone'} · {new Date(m.created_at).toLocaleDateString()}</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{m.message}</p>
                </div>
                <button
                  onClick={() => resolveAdminMessage(m.id, !m.is_resolved).then(invalidate)}
                  className="btn-outline flex-none px-3 py-1 text-xs"
                >
                  {m.is_resolved ? 'Reopen' : 'Resolve'}
                </button>
              </div>
            </div>
          ))}
          {data?.results?.length === 0 && <p className="text-sm text-neutral-500">No messages.</p>}
        </div>
      )}
    </div>
  )
}
