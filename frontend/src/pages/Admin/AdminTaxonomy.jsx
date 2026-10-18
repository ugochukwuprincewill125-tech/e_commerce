import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, Eye, EyeOff, Image as ImageIcon, Pencil, Plus, Trash2, UploadCloud, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ConfirmDialog, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import { useToast } from '../../context/ToastContext'
import useConfirmAction from '../../hooks/useConfirmAction'
import {
  createAdminBrand, createAdminCategory, deleteAdminBrand, deleteAdminCategory,
  fetchAdminBrands, fetchAdminCategories, setCategoryActive, updateAdminBrand,
  updateAdminCategory, uploadCategoryImage,
} from '../../services/adminApi'

/** Uploads above 4MB are rejected by the signing host — block them at pick time. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export function AdminCategories() {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const toast = useToast()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: fetchAdminCategories,
  })

  const save = useAdminMutation({
    fn: async ({ id, file, removeImage, ...attributes }) => {
      const saved = id ? await updateAdminCategory(id, attributes) : await createAdminCategory(attributes)
      try {
        if (file) {
          const key = await uploadCategoryImage(saved.id, file)
          await updateAdminCategory(saved.id, { image_key: key })
        } else if (removeImage) {
          await updateAdminCategory(saved.id, { image_key: '' })
        }
      } catch {
        // The category itself is saved — keep it and close. (Retrying the
        // whole save after a failed upload would duplicate a fresh create.)
        toast.error('Category saved, but the image upload failed. Open it again to retry.')
      }
      return saved
    },
    success: (c) => `${c.name} saved.`,
    invalidate: [['admin-categories']],
    onDone: () => setEditing(null),
  })
  const toggleActive = useAdminMutation({
    fn: ({ id, is_active }) => setCategoryActive(id, is_active),
    success: (c) => `${c.name} ${c.is_active ? 'is visible on the storefront.' : 'is hidden from the storefront.'}`,
    invalidate: [['admin-categories']],
  })
  const remove = useAdminMutation({
    fn: deleteAdminCategory,
    success: (d) => d.detail || 'Category deleted.',
    invalidate: [['admin-categories'], ['admin-products']],
    onDone: () => setConfirmDelete(null),
  })

  const rows = data?.results || []
  const hiddenCount = rows.filter((c) => !c.is_active).length

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
              {hiddenCount > 0 && (
                <p className="border-b border-line bg-metal-50 px-4 py-2 text-xs text-metal-500">
                  {hiddenCount === 1 ? '1 category is' : `${hiddenCount} categories are`} hidden — they don’t appear on
                  the storefront. Use the eye to show or hide a category.
                </p>
              )}
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.image ? (
                            <img src={c.image} alt="" className="h-10 w-10 flex-none rounded object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 flex-none items-center justify-center rounded bg-metal-100 text-metal-400">
                              <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block font-semibold text-ink-900 whitespace-normal break-words">{c.name}</span>
                            {!c.is_active && (
                              <span className="mt-0.5 inline-flex rounded-full bg-metal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-metal-500">
                                Hidden
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
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
                        <button
                          type="button"
                          onClick={() => toggleActive.mutate({ id: c.id, is_active: !c.is_active })}
                          className={c.is_active
                            ? 'rounded p-1.5 text-ink-900 transition hover:bg-metal-100'
                            : 'rounded p-1.5 text-metal-400 transition hover:bg-metal-100 hover:text-ink-900'}
                          title={c.is_active ? 'Hide from the storefront' : 'Show on the storefront'}
                          aria-label={c.is_active ? `Hide ${c.name} from the storefront` : `Show ${c.name} on the storefront`}
                        >
                          {c.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
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
        <CategoryDialog
          title={editing.id ? 'Edit category' : 'New category'}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(payload) => save.mutate({ id: editing.id, ...payload })}
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
                      <td className="px-4 py-3 font-semibold text-ink-900 whitespace-normal break-words">{b.name}</td>
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

/**
 * Category create/edit dialog — name, icon, and the storefront cover image.
 * The image uses the same sign → PUT → attach flow as product images: it is
 * uploaded after the category row exists, so a failed upload never blocks the
 * text fields (the category simply saves without a new image).
 */
function CategoryDialog({ title, initial, onClose, onSave, pending }) {
  const [form, setForm] = useState({ name: initial?.name || '', icon: initial?.icon || '' })
  const [file, setFile] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const fileRef = useRef(null)
  const toast = useToast()
  const confirm = useConfirmAction()

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const storedImage = removeImage ? null : initial?.image
  const shown = preview || storedImage

  const pickFile = (e) => {
    const picked = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file after a failed pick
    if (!picked) return
    if (picked.size > MAX_IMAGE_BYTES) {
      toast.error(
        'Image too large — 4MB limit',
        `Images above 4MB can't be uploaded. Compress ${picked.name} to 4MB or less and pick it again.`,
      )
      return
    }
    setFile(picked)
    setRemoveImage(false)
  }

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('A category needs a name.')
      return
    }
    confirm.ask({
      title: initial?.id ? 'Save these changes?' : 'Create it?',
      body: `Are you sure you want to save this? “${form.name}” will be ${initial?.id ? 'updated' : 'added to the catalogue'}.`,
      confirmLabel: 'Save',
      tone: 'primary',
      action: () => onSave({ name: form.name, icon: form.icon, file, removeImage }),
    })
  }

  return (
    <Modal open onClose={onClose} title={title} size="max-w-md">
      <div className="space-y-4 p-5">
        <label className="block text-[13px] font-semibold text-ink-900">
          Name
          <input
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="block text-[13px] font-semibold text-ink-900">
          Lucide icon name
          <input
            className="input mt-1"
            placeholder="smartphone"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
          />
        </label>

        <div>
          <p className="text-[13px] font-semibold text-ink-900">Category image</p>
          <div className="mt-1 overflow-hidden rounded-lg border border-dashed border-line">
            {shown ? (
              <img src={shown} alt="" className="h-36 w-full object-cover" />
            ) : (
              <div className="flex h-36 items-center justify-center bg-metal-50 text-xs text-metal-400">
                No image yet — the card keeps its icon tile.
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline">
              <UploadCloud className="h-4 w-4" /> {shown ? 'Replace image' : 'Choose image'}
            </button>
            {shown && (
              <button
                type="button"
                onClick={() => { setFile(null); setRemoveImage(Boolean(initial?.image)) }}
                className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
          </div>
          <p className="mt-1.5 text-xs text-metal-500">
            Shown on the storefront Categories page only. JPG, PNG or WebP up to 4MB.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" disabled={pending} className="btn-accent" onClick={submit}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {confirm.modal}
    </Modal>
  )
}

function CrudDialog({ title, fields, initial, onClose, save, pending }) {
  const [form, setForm] = useState(initial)
  const confirm = useConfirmAction()
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
          <button
            type="button"
            disabled={pending}
            className="btn-accent"
            onClick={() =>
              confirm.ask({
                title: initial?.id ? 'Save these changes?' : 'Create it?',
                body: `Are you sure you want to save this? “${form?.name || ''}” will be ${initial?.id ? 'updated' : 'added to the catalogue'}.`,
                confirmLabel: 'Save',
                tone: 'primary',
                action: () => save(form),
              })
            }
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {confirm.modal}
    </Modal>
  )
}
