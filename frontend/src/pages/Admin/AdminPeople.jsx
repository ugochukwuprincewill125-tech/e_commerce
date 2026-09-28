import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Search, Shield, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ConfirmDialog, ExportButton,
  TableFooter, exportCsv, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import useDebounce from '../../hooks/useDebounce'
import { useAuth } from '../../context/AuthContext'
import { formatNaira } from '../../utils/format'
import {
  approveAdminReview, deleteAdminReview, fetchAdminCustomer, fetchAdminCustomers,
  fetchAdminMessages, fetchAdminReviews, resolveAdminMessage, setCustomerActive,
  setCustomerStaff, updateAdminCustomer,
} from '../../services/adminApi'

/* ------------------------------------------------------------- customers */

const CUSTOMER_CSV = [
  { label: 'Name', get: (c) => c.full_name },
  { label: 'Email', get: (c) => c.email },
  { label: 'Phone', get: (c) => c.phone },
  { label: 'Orders', get: (c) => c.order_count },
  { label: 'Total spent', get: (c) => c.total_spent },
  { label: 'Verified', get: (c) => (c.email_verified ? 'yes' : 'no') },
  { label: 'Active', get: (c) => (c.is_active ? 'yes' : 'blocked') },
]

export function AdminCustomers() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState(null)
  const debounced = useDebounce(search)

  const verified = params.get('email_verified') || ''
  const staffOnly = params.get('is_staff') || ''

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const query = { page, page_size: 25 }
  if (debounced) query.search = debounced
  if (verified) query.email_verified = verified
  if (staffOnly) query.is_staff = staffOnly

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-customers', query],
    queryFn: () => fetchAdminCustomers(query),
  })

  const rows = data?.results || []

  return (
    <AdminPage
      title="Customers"
      description="Everyone with an account, what they have spent, and who can reach the admin."
      actions={
        <ExportButton
          onClick={() => exportCsv('customers.csv', rows, CUSTOMER_CSV)}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metal-400" />
          <input
            className="input pl-9"
            placeholder="Search name, email or phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select className="input w-auto" value={verified} onChange={(e) => setParam('email_verified', e.target.value)} aria-label="Filter by email verification">
          <option value="">Any verification</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
        <select className="input w-auto" value={staffOnly} onChange={(e) => setParam('is_staff', e.target.value)} aria-label="Filter by role">
          <option value="">Everyone</option>
          <option value="true">Staff only</option>
          <option value="false">Customers only</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-metal-500">Loading customers…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : (
        <AdminCard>
          {rows.length === 0 ? (
            <AdminEmpty>No customers match these filters.</AdminEmpty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Customer</th>
                      <th className="px-4 py-2.5 font-semibold">Joined</th>
                      <th className="px-4 py-2.5 font-semibold">Orders</th>
                      <th className="px-4 py-2.5 font-semibold">Total spent</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink-900">{c.full_name || '—'}</p>
                          <p className="text-xs text-metal-500">{c.email}</p>
                        </td>
                        <td className="px-4 py-3 text-metal-600">{new Date(c.date_joined).toLocaleDateString()}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-900">{c.order_count}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-900">{formatNaira(c.total_spent)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <span className={`chip ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {c.is_active ? 'Active' : 'Blocked'}
                            </span>
                            {c.is_staff && <span className="chip bg-ink-900 text-white">Staff</span>}
                            {!c.email_verified && <span className="chip bg-amber-100 text-amber-800">Unverified</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setOpenId(c.id)} className="btn-outline px-3 py-1 text-xs">
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TableFooter page={page} pageSize={25} count={rows.length} total={data?.count} onChange={setPage} />
            </>
          )}
        </AdminCard>
      )}

      <CustomerModal id={openId} onClose={() => setOpenId(null)} />
    </AdminPage>
  )
}

function CustomerModal({ id, onClose }) {
  const { user: me } = useAuth()
  const [form, setForm] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const { data: customer, isLoading, isError, error } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: () => fetchAdminCustomer(id),
    enabled: Boolean(id),
  })

  const current = form ?? (customer ? { first_name: customer.first_name || '', last_name: customer.last_name || '', phone: customer.phone || '' } : null)

  const saveMut = useAdminMutation({
    fn: () => updateAdminCustomer(id, current),
    success: 'Customer updated.',
  })
  const activeMut = useAdminMutation({
    fn: (value) => setCustomerActive(id, value),
    success: (d) => d.detail,
    onDone: () => setConfirm(null),
  })
  const staffMut = useAdminMutation({
    fn: (value) => setCustomerStaff(id, value),
    success: (d) => d.detail,
    onDone: () => setConfirm(null),
  })

  const isSelf = customer?.id === me?.id

  return (
    <>
      <Modal open={Boolean(id)} onClose={onClose} title={customer ? customer.full_name || customer.email : 'Customer'} size="max-w-lg">
        {isLoading ? (
          <p className="p-6 text-sm text-metal-500">Loading customer…</p>
        ) : isError ? (
          <div className="p-6"><AdminError error={error} /></div>
        ) : customer ? (
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <input className="input" value={current.first_name} onChange={(e) => setForm({ ...current, first_name: e.target.value })} />
              </Field>
              <Field label="Last name">
                <input className="input" value={current.last_name} onChange={(e) => setForm({ ...current, last_name: e.target.value })} />
              </Field>
              <Field label="Phone" className="sm:col-span-2">
                <input className="input" value={current.phone} onChange={(e) => setForm({ ...current, phone: e.target.value })} />
              </Field>
            </div>
            <p className="text-[13px] text-metal-500">
              {customer.email} · joined {new Date(customer.date_joined).toLocaleDateString()} ·{' '}
              {customer.order_count} orders · {formatNaira(customer.total_spent)} spent · {customer.review_count} reviews
            </p>
            {customer.addresses?.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-900">Saved addresses</h3>
                <ul className="space-y-1 text-[13px] text-metal-600">
                  {customer.addresses.map((a) => (
                    <li key={a.id}>
                      {[a.address, a.city, a.state].filter(Boolean).join(', ')}
                      {a.is_default && <span className="ml-1.5 chip bg-metal-100 text-ink-800">Default</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" className="btn-primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            <div className="space-y-2 border-t border-line pt-4">
              <button
                type="button"
                disabled={isSelf}
                onClick={() => setConfirm({ kind: 'active', value: !customer.is_active })}
                className={`btn w-full ${customer.is_active ? 'text-danger' : 'text-success'}`}
              >
                {customer.is_active ? 'Block this account' : 'Unblock this account'}
              </button>
              {isSelf ? (
                <p className="text-xs text-metal-500">You cannot change your own access.</p>
              ) : me?.is_superuser ? (
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'staff', value: !customer.is_staff })}
                  className="btn-outline w-full"
                >
                  <Shield className="h-4 w-4" />
                  {customer.is_staff ? 'Revoke staff access' : 'Grant staff access'}
                </button>
              ) : (
                <p className="text-xs text-metal-500">Only the store owner can change staff access.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'staff' ? 'Change staff access' : customer?.is_active ? 'Block account' : 'Unblock account'}
        confirmLabel="Confirm"
        busy={activeMut.isPending || staffMut.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm.kind === 'staff' ? staffMut.mutate(confirm.value) : activeMut.mutate(confirm.value))}
        body={
          confirm?.kind === 'staff'
            ? 'Staff accounts can reach every part of the admin area, including other staff accounts and all customer data.'
            : customer?.is_active
              ? 'They will not be able to sign in until the account is unblocked.'
              : 'They will be able to sign in and order again.'
        }
      />
    </>
  )
}

/* --------------------------------------------------------------- reviews */

export function AdminReviews() {
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const filter = params.get('is_approved') ?? 'false'

  const setFilter = (value) => {
    const next = new URLSearchParams(params)
    if (value) next.set('is_approved', value)
    else next.delete('is_approved')
    setParams(next, { replace: true })
    setPage(1)
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-reviews', filter, page],
    queryFn: () => fetchAdminReviews({ is_approved: filter, page, page_size: 20 }),
  })

  const approveMut = useAdminMutation({
    fn: ({ id, value }) => approveAdminReview(id, value),
    invalidate: [['admin-reviews'], ['admin-stats']],
  })
  const deleteMut = useAdminMutation({
    fn: deleteAdminReview,
    success: 'Review deleted.',
    invalidate: [['admin-reviews'], ['admin-stats']],
    onDone: () => setConfirmDelete(null),
  })

  const rows = data?.results || []

  return (
    <AdminPage title="Reviews" description="Approve what customers wrote, or remove anything that breaks the rules.">
      <div className="flex gap-1">
        {[
          { label: 'Pending', value: 'false' },
          { label: 'Published', value: 'true' },
          { label: 'All', value: '' },
        ].map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(f.value)}
            className={filter === f.value ? 'btn-primary' : 'btn-outline'}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-metal-500">Loading reviews…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <AdminCard><AdminEmpty>Nothing to review here.</AdminEmpty></AdminCard>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((r) => (
              <AdminCard key={r.id}>
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      <span className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                      {r.product_name}
                    </p>
                    <p className="mt-0.5 text-xs text-metal-500">
                      {r.customer_name} ({r.customer_email}) · {new Date(r.created_at).toLocaleDateString()}
                      {r.is_verified_purchase && <span className="ml-1.5 chip bg-emerald-100 text-emerald-700">Verified purchase</span>}
                    </p>
                    {r.title && <p className="mt-2 text-sm font-semibold text-ink-900">{r.title}</p>}
                    <p className="mt-1 whitespace-pre-line text-sm text-metal-600">{r.comment}</p>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button
                      type="button"
                      onClick={() => approveMut.mutate({ id: r.id, value: !r.is_approved })}
                      className="btn-outline px-3 py-1 text-xs"
                    >
                      {r.is_approved ? <><X className="h-3.5 w-3.5" /> Unpublish</> : <><Check className="h-3.5 w-3.5" /> Approve</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(r)}
                      className="rounded p-1.5 text-danger transition hover:bg-red-50"
                      aria-label="Delete review"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>
          <TableFooter page={page} pageSize={20} count={rows.length} total={data?.count} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete review"
        confirmLabel="Delete"
        busy={deleteMut.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        body={confirmDelete ? 'This permanently removes the review and recalculates the product rating.' : ''}
      />
    </AdminPage>
  )
}

/* -------------------------------------------------------------- messages */

export function AdminMessages() {
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)

  const filter = params.get('is_resolved') ?? 'false'

  const setFilter = (value) => {
    const next = new URLSearchParams(params)
    if (value) next.set('is_resolved', value)
    else next.delete('is_resolved')
    setParams(next, { replace: true })
    setPage(1)
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-messages', filter, page],
    queryFn: () => fetchAdminMessages({ is_resolved: filter, page, page_size: 20 }),
  })

  const resolveMut = useAdminMutation({
    fn: ({ id, value }) => resolveAdminMessage(id, value),
    invalidate: [['admin-messages'], ['admin-stats']],
  })

  const rows = data?.results || []

  return (
    <AdminPage title="Messages" description="Enquiries from the contact form.">
      <div className="flex gap-1">
        {[
          { label: 'Open', value: 'false' },
          { label: 'Resolved', value: 'true' },
          { label: 'All', value: '' },
        ].map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(f.value)}
            className={filter === f.value ? 'btn-primary' : 'btn-outline'}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-metal-500">Loading messages…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <AdminCard><AdminEmpty>No messages here.</AdminEmpty></AdminCard>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((m) => (
              <AdminCard key={m.id}>
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">{m.subject}</p>
                    <p className="mt-0.5 text-xs text-metal-500">
                      {m.name} · {m.email} · {m.phone || 'no phone'} · {new Date(m.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-metal-600">{m.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resolveMut.mutate({ id: m.id, value: !m.is_resolved })}
                    className="btn-outline flex-none px-3 py-1 text-xs"
                  >
                    {m.is_resolved ? 'Reopen' : 'Resolve'}
                  </button>
                </div>
              </AdminCard>
            ))}
          </div>
          <TableFooter page={page} pageSize={20} count={rows.length} total={data?.count} onChange={setPage} />
        </>
      )}
    </AdminPage>
  )
}

export function Field({ label, className = '', children }) {
  return (
    <label className={`block text-[13px] font-semibold text-ink-900 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}
