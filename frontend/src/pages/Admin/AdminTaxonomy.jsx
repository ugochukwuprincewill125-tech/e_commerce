import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

import { useToast } from '../../context/ToastContext'
import {
  fetchAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory,
  fetchAdminBrands, createAdminBrand, updateAdminBrand, deleteAdminBrand,
} from '../../services/adminApi'

function useCrud({ listKey, create, update, remove, noun }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(null)

  const done = (msg) => { qc.invalidateQueries({ queryKey: [listKey] }); toast.push(msg); setEditing(null) }
  const fail = (e) => toast.push(e.response?.data?.detail || `Could not save the ${noun}.`)

  return {
    editing,
    setEditing,
    save: useMutation({
      mutationFn: (payload) => (editing?.id ? update(editing.id, payload) : create(payload)),
      onSuccess: () => done(editing?.id ? `${noun} updated.` : `${noun} created.`),
      onError: fail,
    }),
    remove: useMutation({
      mutationFn: remove,
      onSuccess: () => { qc.invalidateQueries({ queryKey: [listKey] }); toast.push(`${noun} deleted.`) },
      onError: fail,
    }),
  }
}

function CrudDialog({ title, fields, initial, onClose, save, pending }) {
  const [form, setForm] = useState(initial)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 text-sm">
          {fields.map(({ key, label, type }) => (
            <label key={key} className="block">
              {label}
              <input className="input" type={type || 'text'} value={form?.[key] ?? ''} onChange={set(key)} />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button onClick={() => save(form)} disabled={pending} className="btn-accent">{pending ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export function AdminCategories() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories })
  const { editing, setEditing, save, remove } = useCrud({
    listKey: 'admin-categories', noun: 'Category',
    create: createAdminCategory, update: updateAdminCategory, remove: deleteAdminCategory,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-950">Categories</h1>
        <button onClick={() => setEditing({ name: '', icon: '' })} className="btn-accent flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> New category
        </button>
      </div>
      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="p-3">Name</th><th>Slug</th><th>Products</th><th /></tr></thead>
            <tbody>
              {data?.results?.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="p-3 font-semibold">{c.name}</td>
                  <td className="text-neutral-500">{c.slug}</td>
                  <td className="tabular-nums">{c.product_count}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <button onClick={() => setEditing(c)} className="mr-1 rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                    <button
                      onClick={() => (c.product_count ? alert('Move its products to another category first.') : remove.mutate(c.id))}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    ><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CrudDialog
          title={editing.id ? 'Edit category' : 'New category'}
          fields={[{ key: 'name', label: 'Name' }, { key: 'icon', label: 'Lucide icon name (optional)' }]}
          initial={editing}
          onClose={() => setEditing(null)}
          save={(f) => save.mutate(f)}
          pending={save.isPending}
        />
      )}
    </div>
  )
}

export function AdminBrands() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-brands'], queryFn: fetchAdminBrands })
  const { editing, setEditing, save, remove } = useCrud({
    listKey: 'admin-brands', noun: 'Brand',
    create: createAdminBrand, update: updateAdminBrand, remove: deleteAdminBrand,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-950">Brands</h1>
        <button onClick={() => setEditing({ name: '', website: '' })} className="btn-accent flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> New brand
        </button>
      </div>
      {isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="p-3">Name</th><th>Products</th><th /></tr></thead>
            <tbody>
              {data?.results?.map((b) => (
                <tr key={b.id} className="border-t border-neutral-100">
                  <td className="p-3 font-semibold">{b.name}</td>
                  <td className="tabular-nums">{b.product_count}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <button onClick={() => setEditing(b)} className="mr-1 rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                    <button
                      onClick={() => (b.product_count ? alert('Remove its products first.') : remove.mutate(b.id))}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    ><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CrudDialog
          title={editing.id ? 'Edit brand' : 'New brand'}
          fields={[{ key: 'name', label: 'Name' }, { key: 'website', label: 'Website (optional)' }]}
          initial={editing}
          onClose={() => setEditing(null)}
          save={(f) => save.mutate(f)}
          pending={save.isPending}
        />
      )}
    </div>
  )
}
