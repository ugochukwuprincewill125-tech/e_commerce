import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ConfirmDialog, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import {
  createAdminBrand, createAdminCategory, deleteAdminBrand, deleteAdminCategory,
  fetchAdminBrands, fetchAdminCategories, updateAdminBrand, updateAdminCategory,
} from '../../services/adminApi'

export function AdminCategories() {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: fetchAdminCategories,
  })

  const save = useAdminMutation({
    fn: (payload) => (payload.id ? updateAdminCategory(payload.id, payload) : createAdminCategory(payload)),
    success: 'Category saved.',
    invalidate: [['admin-categories']],
    onDone: () => setEditing(null),
  })
  const remove = useAdminMutation({
    fn: deleteAdminCategory,
    success: (d) => d.detail || 'Category deleted.',
    invalidate: [['admin-categories'], ['admin-products']],
    onDone: () => setConfirmDelete(null),
  })

  const rows = data?.results || []

  return (
    <AdminPage
      title="Categories"
      description="The catalogue tree customers browse."
      actions={
        <button type="button" onClick={() => setEditing({ name: '', icon: '' })} className="btn-accent">
          <Plus className="h-4 w-4" /> New category
        </button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-metal-500">Loading categories…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : (
        <AdminCard>
          {rows.length === 0 ? (
            <AdminEmpty>No categories yet.</AdminEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Slug</th>
                    <th className="px-4 py-2.5 font-semibold">Products</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                      <td className="px-4 py-3 font-semibold text-ink-900">{c.name}</td>
                      <td className="px-4 py-3 text-metal-500">{c.slug}</td>
                      <td className="px-4 py-3">
                        {/* Drill straight into this category's products. */}
                        <Link
                          to={`/admin/products?category=${c.slug}`}
                          className="inline-flex items-center gap-1 tabular-nums text-ink-900 transition hover:text-brand-600 hover:underline"
                        >
                          {c.product_count}
                          <ArrowRight className="h-3.5 w-3.5 text-metal-400" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setEditing(c)} className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50" aria-label={`Edit ${c.name}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(c)}
                          className="rounded p-1.5 text-danger transition hover:bg-red-50"
                          aria-label={`Delete ${c.name}`}
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
        <CrudDialog
          title={editing.id ? 'Edit category' : 'New category'}
          fields={[
            { key: 'name', label: 'Name' },
            { key: 'icon', label: 'Lucide icon name', placeholder: 'smartphone' },
          ]}
          initial={editing}
          onClose={() => setEditing(null)}
          save={(f) => save.mutate({ id: editing.id, name: f.name, icon: f.icon })}
          pending={save.isPending}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete category"
        confirmLabel="Delete"
        busy={remove.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => remove.mutate(confirmDelete.id)}
        body={
          confirmDelete?.product_count
            ? `“${confirmDelete.name}” still holds ${confirmDelete.product_count} product(s). Move them to another category first — the server will refuse to delete it otherwise.`
            : confirmDelete
              ? `“${confirmDelete.name}” will be removed from the catalogue.`
              : ''
        }
      />
    </AdminPage>
  )
}

export function AdminBrands() {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: fetchAdminBrands,
  })

  const save = useAdminMutation({
    fn: (payload) => (payload.id ? updateAdminBrand(payload.id, payload) : createAdminBrand(payload)),
    success: 'Brand saved.',
    invalidate: [['admin-brands']],
    onDone: () => setEditing(null),
  })
  const remove = useAdminMutation({
    fn: deleteAdminBrand,
    success: (d) => d.detail || 'Brand deleted.',
    invalidate: [['admin-brands'], ['admin-products']],
    onDone: () => setConfirmDelete(null),
  })

  const rows = data?.results || []

  return (
    <AdminPage
      title="Brands"
      description="Manufacturers whose products you stock."
      actions={
        <button type="button" onClick={() => setEditing({ name: '', website: '' })} className="btn-accent">
          <Plus className="h-4 w-4" /> New brand
        </button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-metal-500">Loading brands…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : (
        <AdminCard>
          {rows.length === 0 ? (
            <AdminEmpty>No brands yet.</AdminEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Products</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                      <td className="px-4 py-3 font-semibold text-ink-900">{b.name}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-900">{b.product_count}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setEditing(b)} className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50" aria-label={`Edit ${b.name}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(b)}
                          className="rounded p-1.5 text-danger transition hover:bg-red-50"
                          aria-label={`Delete ${b.name}`}
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
        <CrudDialog
          title={editing.id ? 'Edit brand' : 'New brand'}
          fields={[
            { key: 'name', label: 'Name' },
            { key: 'website', label: 'Website', placeholder: 'https://' },
          ]}
          initial={editing}
          onClose={() => setEditing(null)}
          save={(f) => save.mutate({ id: editing.id, name: f.name, website: f.website })}
          pending={save.isPending}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete brand"
        confirmLabel="Delete"
        busy={remove.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => remove.mutate(confirmDelete.id)}
        body={
          confirmDelete?.product_count
            ? `“${confirmDelete.name}” is still attached to ${confirmDelete.product_count} product(s). Reassign them first.`
            : confirmDelete
              ? `“${confirmDelete.name}” will be removed from the catalogue.`
              : ''
        }
      />
    </AdminPage>
  )
}

function CrudDialog({ title, fields, initial, onClose, save, pending }) {
  const [form, setForm] = useState(initial)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Modal open onClose={onClose} title={title} size="max-w-md">
      <div className="space-y-3 p-5">
        {fields.map(({ key, label, placeholder }) => (
          <label key={key} className="block text-[13px] font-semibold text-ink-900">
            {label}
            <input className="input mt-1" placeholder={placeholder} value={form?.[key] ?? ''} onChange={set(key)} />
          </label>
        ))}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" onClick={() => save(form)} disabled={pending} className="btn-accent">
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
