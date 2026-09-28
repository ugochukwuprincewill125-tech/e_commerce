import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Power, Trash2 } from 'lucide-react'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ConfirmDialog, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import { formatNaira } from '../../utils/format'
import {
  createAdminCoupon, deleteAdminCoupon, fetchAdminCoupons, updateAdminCoupon,
} from '../../services/adminApi'

const BLANK = {
  code: '', description: '', discount_type: 'percentage', discount_value: '',
  minimum_order: 0, maximum_discount: '', usage_limit: '', expiry_date: '', active: true,
}

export default function AdminCoupons() {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: fetchAdminCoupons,
  })

  const toggleMut = useAdminMutation({
    fn: (c) => updateAdminCoupon(c.id, { active: !c.active }),
    success: (d, c) => `${c.code} is now ${c.active ? 'inactive' : 'active'}.`,
    invalidate: [['admin-coupons']],
  })
  const deleteMut = useAdminMutation({
    fn: deleteAdminCoupon,
    success: (d) => d.detail || 'Coupon deleted.',
    invalidate: [['admin-coupons']],
    onDone: () => setConfirmDelete(null),
  })

  const rows = data?.results || []

  return (
    <AdminPage
      title="Coupons"
      description="Discount codes, their limits and when they expire."
      actions={
        <button type="button" onClick={() => setEditing({ ...BLANK })} className="btn-accent">
          <Plus className="h-4 w-4" /> New coupon
        </button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-metal-500">Loading coupons…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : (
        <AdminCard>
          {rows.length === 0 ? (
            <AdminEmpty>No coupons yet.</AdminEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Code</th>
                    <th className="px-4 py-2.5 font-semibold">Discount</th>
                    <th className="px-4 py-2.5 font-semibold">Minimum order</th>
                    <th className="px-4 py-2.5 font-semibold">Used</th>
                    <th className="px-4 py-2.5 font-semibold">Expires</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                      <td className="px-4 py-3">
                        <p className="font-mono font-bold text-ink-900">{c.code}</p>
                        {c.description && <p className="max-w-[220px] truncate text-xs text-metal-500">{c.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink-900">
                        {c.discount_type === 'percentage'
                          ? `${Number(c.discount_value)}%`
                          : formatNaira(c.discount_value)}
                        {c.maximum_discount ? (
                          <span className="block text-xs text-metal-500">max {formatNaira(c.maximum_discount)}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-900">{formatNaira(c.minimum_order)}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-900">
                        {c.times_used}{c.usage_limit ? ` / ${c.usage_limit}` : ''}
                      </td>
                      <td className="px-4 py-3 text-metal-600">
                        {c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`chip ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-metal-200 text-ink-800'}`}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleMut.mutate(c)}
                          className="rounded p-1.5 text-metal-500 transition hover:bg-metal-100 hover:text-ink-900"
                          title={c.active ? 'Deactivate' : 'Activate'}
                          aria-label={c.active ? `Deactivate ${c.code}` : `Activate ${c.code}`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setEditing(c)} className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(c)}
                          className="rounded p-1.5 text-danger transition hover:bg-red-50"
                          title="Delete"
                          aria-label={`Delete ${c.code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      )}

      {editing && (
        <CouponForm
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete coupon"
        confirmLabel="Delete"
        busy={deleteMut.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        body={
          confirmDelete
            ? `“${confirmDelete.code}” will stop working immediately. Orders that already used it keep their discount.`
            : ''
        }
      />
    </AdminPage>
  )
}

function CouponForm({ initial, onClose }) {
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...initial,
    discount_value: initial.discount_value ?? '',
    minimum_order: initial.minimum_order ?? 0,
    maximum_discount: initial.maximum_discount ?? '',
    usage_limit: initial.usage_limit ?? '',
    expiry_date: initial.expiry_date ? String(initial.expiry_date).slice(0, 10) : '',
  }))

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  const mutation = useAdminMutation({
    fn: () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description || '',
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        minimum_order: Number(form.minimum_order || 0),
        maximum_discount: form.maximum_discount === '' ? null : Number(form.maximum_discount),
        usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
        expiry_date: form.expiry_date || null,
        active: Boolean(form.active),
      }
      return initial.id ? updateAdminCoupon(initial.id, payload) : createAdminCoupon(payload)
    },
    success: initial.id ? 'Coupon updated.' : 'Coupon created.',
    invalidate: [['admin-coupons']],
    onDone: onClose,
  })

  return (
    <Modal open onClose={onClose} title={initial.id ? `Edit · ${initial.code}` : 'New coupon'} size="max-w-lg">
      <div className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" hint={initial.id ? 'The code cannot be changed.' : undefined}>
            <input className="input uppercase" value={form.code} onChange={set('code')} disabled={Boolean(initial.id)} />
          </Field>
          <Field label="Description">
            <input className="input" value={form.description || ''} onChange={set('description')} />
          </Field>
          <Field label="Type">
            <select className="input" value={form.discount_type} onChange={set('discount_type')}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed amount (₦)</option>
            </select>
          </Field>
          <Field label="Value">
            <input className="input" type="number" min="0" value={form.discount_value} onChange={set('discount_value')} />
          </Field>
          <Field label="Minimum order (₦)">
            <input className="input" type="number" min="0" value={form.minimum_order} onChange={set('minimum_order')} />
          </Field>
          <Field label="Maximum discount (₦)" hint="Caps a percentage discount.">
            <input className="input" type="number" min="0" value={form.maximum_discount} onChange={set('maximum_discount')} />
          </Field>
          <Field label="Usage limit" hint="Blank means unlimited.">
            <input className="input" type="number" min="0" value={form.usage_limit} onChange={set('usage_limit')} />
          </Field>
          <Field label="Expires">
            <input className="input" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-800">
          <input type="checkbox" checked={Boolean(form.active)} onChange={set('active')} /> Active
        </label>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" className="btn-accent" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-[13px] font-semibold text-ink-900">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs font-normal text-metal-500">{hint}</span>}
    </label>
  )
}
