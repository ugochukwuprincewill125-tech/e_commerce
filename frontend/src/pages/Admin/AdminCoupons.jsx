import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, X } from 'lucide-react'

import { useToast } from '../../context/ToastContext'
import { fetchAdminCoupons, createAdminCoupon, updateAdminCoupon } from '../../services/adminApi'

export default function AdminCoupons() {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const { data, isLoading } = useQuery({ queryKey: ['admin-coupons'], queryFn: fetchAdminCoupons })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-coupons'] })
  const save = useMutation({
    mutationFn: (payload) => (editing.id ? updateAdminCoupon(editing.id, payload) : createAdminCoupon(payload)),
    onSuccess: () => { invalidate(); toast.push('Coupon saved.'); setEditing(null) },
    onError: (e) => toast.push(e.response?.data?.detail || 'Could not save the coupon.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-950">Coupons</h1>
        <button
          onClick={() => setEditing({ code: '', discount_type: 'percentage', discount_value: '', minimum_order: 0, active: true })}
          className="btn-accent flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" /> New coupon
        </button>
      </div>

      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr><th className="p-3">Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data?.results?.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="p-3 font-mono font-bold">{c.code}</td>
                  <td>{c.discount_type === 'percentage' ? `${c.discount_value}%` : `₦${Number(c.discount_value).toLocaleString()}`}</td>
                  <td className="tabular-nums">₦{Number(c.minimum_order).toLocaleString()}</td>
                  <td className="tabular-nums">{c.times_used}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-600'}`}>
                      {c.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(c)} className="mr-1 rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => updateAdminCoupon(c.id, { active: !c.active }).then(invalidate)} className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100" title="Toggle active">
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {data?.results?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No coupons yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">{editing.id ? 'Edit coupon' : 'New coupon'}</h2>
              <button onClick={() => setEditing(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <label className="block">Code
                <input className="input uppercase" value={editing.code} disabled={Boolean(editing.id)}
                  onChange={(e) => setEditing((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>Type
                  <select className="input" value={editing.discount_type} onChange={(e) => setEditing((f) => ({ ...f, discount_type: e.target.value }))}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (₦)</option>
                  </select>
                </label>
                <label>Value
                  <input className="input" type="number" value={editing.discount_value} onChange={(e) => setEditing((f) => ({ ...f, discount_value: e.target.value }))} />
                </label>
              </div>
              <label>Minimum order (₦)
                <input className="input" type="number" value={editing.minimum_order} onChange={(e) => setEditing((f) => ({ ...f, minimum_order: e.target.value }))} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(editing.active)} onChange={(e) => setEditing((f) => ({ ...f, active: e.target.checked }))} /> Active
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-outline">Cancel</button>
              <button onClick={() => save.mutate({ ...editing, minimum_order: editing.minimum_order || 0 })} disabled={save.isPending} className="btn-accent">
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
