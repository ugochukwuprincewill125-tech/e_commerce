import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Minus, Pencil, Plus, RotateCcw, Search, Trash2, UploadCloud, X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ConfirmDialog, ExportButton,
  TableFooter, exportCsv, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import useDebounce from '../../hooks/useDebounce'
import { useToast } from '../../context/ToastContext'
import { formatNaira } from '../../utils/format'
import {
  adjustProductStock, createAdminProduct, deleteAdminProduct, deleteProductImage,
  fetchAdminBrands, fetchAdminCategories, fetchAdminProducts, reorderProductImages,
  restoreAdminProduct, updateAdminProduct, uploadProductImages,
} from '../../services/adminApi'

const TYPES = ['device', 'computing', 'audio', 'wearable', 'power', 'storage', 'networking', 'accessory', 'gaming', 'security', 'software']

const EMPTY = {
  name: '', sku: '', category: '', brand: '', product_type: 'accessory',
  price: '', discount_price: '', stock_quantity: '', short_description: '',
  description: '', warranty: '', specifications: '{}', is_active: true,
  featured: false, bestseller: false, new_arrival: false,
  meta_title: '', meta_description: '',
}

/* ------------------------------------------------------------------ helpers */

/** Parse the specifications box, surfacing a real message instead of a crash. */
function parseSpecs(raw) {
  const text = (raw || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }
    return parsed
  } catch (e) {
    throw new Error(`Specifications must be valid JSON — ${e.message}`)
  }
}

const CSV = [
  { label: 'SKU', get: (p) => p.sku },
  { label: 'Name', get: (p) => p.name },
  { label: 'Category', get: (p) => p.category?.name },
  { label: 'Price', get: (p) => p.price },
  { label: 'Sale price', get: (p) => p.discount_price },
  { label: 'Stock', get: (p) => p.stock_quantity },
  { label: 'Active', get: (p) => (p.is_active ? 'yes' : 'archived') },
]

/* -------------------------------------------------------------------- page */

export default function AdminProducts() {
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [stockFor, setStockFor] = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(null)
  const debounced = useDebounce(search)

  const archived = params.get('archived') === 'true'
  const availability = params.get('availability') || ''
  const lowStockOnly = params.get('low_stock') === 'true'
  const category = params.get('category') || ''

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const query = { page, page_size: 25, is_active: archived ? 'false' : 'true' }
  if (debounced) query.search = debounced
  if (availability) query.availability = availability
  if (category) query.category = category
  if (lowStockOnly) query.low_stock = 'true'

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-products', query],
    queryFn: () => fetchAdminProducts(query),
  })
  const { data: categories } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories })
  const { data: brands } = useQuery({ queryKey: ['admin-brands'], queryFn: fetchAdminBrands })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-products'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  const archiveMut = useAdminMutation({
    fn: deleteAdminProduct,
    success: (d) => d.detail || 'Archived.',
    onDone: () => {
      invalidate()
      setConfirmArchive(null)
    },
  })
  const restoreMut = useAdminMutation({
    fn: restoreAdminProduct,
    success: (d) => d.detail || 'Restored.',
    invalidate: [['admin-products'], ['admin-stats']],
  })

  const products = data?.results || []

  const setArchivedFilter = (value) => setParam('archived', value ? 'true' : '')

  return (
    <AdminPage
      title="Products"
      description="Publish, edit, price, restock and archive everything in the catalogue."
      actions={
        <>
          <ExportButton
            onClick={() => {
              exportCsv('products.csv', products, CSV)
              toast.success(`Exported ${products.length} product(s).`)
            }}
          />
          <button type="button" onClick={() => setArchivedFilter(!archived)} className="btn-outline">
            {archived ? 'View live catalogue' : 'View archive'}
          </button>
          <button type="button" onClick={() => setEditing({})} className="btn-accent">
            <Plus className="h-4 w-4" /> New product
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metal-400" />
          <input
            className="input pl-9"
            placeholder="Search name or SKU…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select className="input w-auto" value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories?.results?.map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select className="input w-auto" value={availability} onChange={(e) => setParam('availability', e.target.value)} aria-label="Filter by stock">
          <option value="">Any stock</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
        <button
          type="button"
          onClick={() => setParam('low_stock', lowStockOnly ? '' : 'true')}
          className={lowStockOnly ? 'btn-primary' : 'btn-outline'}
        >
          <AlertTriangle className="h-4 w-4" /> Low stock only
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-metal-500">Loading products…</p>
      ) : isError ? (
        <AdminError error={error} onRetry={refetch} />
      ) : (
        <AdminCard>
          {products.length === 0 ? (
            <AdminEmpty>
              {archived ? 'The archive is empty.' : lowStockOnly ? 'Nothing is running low.' : 'No products yet — click "New product" to publish your first item.'}
            </AdminEmpty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-line text-[11px] uppercase tracking-wide text-metal-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Product</th>
                      <th className="px-4 py-2.5 font-semibold">Category</th>
                      <th className="px-4 py-2.5 font-semibold">Price</th>
                      <th className="px-4 py-2.5 font-semibold">Stock</th>
                      <th className="px-4 py-2.5 font-semibold">Flags</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0 hover:bg-metal-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.image && <img src={p.image} alt="" className="h-10 w-10 flex-none rounded object-cover" />}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink-900">{p.name}</p>
                              <p className="text-xs text-metal-500">{p.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-metal-600">{p.category?.name || '—'}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-900">
                          {formatNaira(p.current_price)}
                          {p.discount_price && <span className="ml-1.5 text-xs text-metal-400 line-through">{formatNaira(p.price)}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setStockFor(p)}
                            className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 tabular-nums transition hover:bg-metal-100"
                            title="Adjust stock"
                          >
                            <span className={p.stock_quantity === 0 ? 'font-semibold text-danger' : p.is_low_stock ? 'font-semibold text-amber-600' : 'text-ink-900'}>
                              {p.stock_quantity}
                            </span>
                            {p.is_low_stock && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {p.featured && <span className="chip bg-amber-100 text-amber-800">Featured</span>}
                            {p.bestseller && <span className="chip bg-blue-100 text-blue-800">Bestseller</span>}
                            {p.new_arrival && <span className="chip bg-emerald-100 text-emerald-800">New</span>}
                            {!p.is_active && <span className="chip bg-metal-200 text-ink-800">Archived</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => setStockFor(p)} className="rounded p-1.5 text-metal-500 transition hover:bg-metal-100 hover:text-ink-900" title="Adjust stock">
                            <Minus className="h-4 w-4" />
                          </button>
                          {p.is_active ? (
                            <button type="button" onClick={() => setConfirmArchive(p)} className="rounded p-1.5 text-danger transition hover:bg-red-50" title="Archive">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => restoreMut.mutate(p.id)}
                              disabled={restoreMut.isPending}
                              className="rounded p-1.5 text-success transition hover:bg-emerald-50"
                              title="Restore"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          <button type="button" onClick={() => setEditing(p)} className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TableFooter page={page} pageSize={25} count={products.length} total={data?.count} onChange={setPage} />
            </>
          )}
        </AdminCard>
      )}

      {editing && (
        <ProductForm
          initial={editing.id ? editing : null}
          categories={categories}
          brands={brands}
          onClose={() => setEditing(null)}
        />
      )}

      <StockDialog
        product={stockFor}
        onClose={() => setStockFor(null)}
        onDone={invalidate}
      />

      <ConfirmDialog
        open={Boolean(confirmArchive)}
        title="Archive product"
        confirmLabel="Archive"
        busy={archiveMut.isPending}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => archiveMut.mutate(confirmArchive.id)}
        body={
          confirmArchive
            ? `“${confirmArchive.name}” will be hidden from the store. Its order history is kept, and you can restore it from the archive.`
            : ''
        }
      />
    </AdminPage>
  )
}

/* -------------------------------------------------------------- stock edit */

function StockDialog({ product, onClose, onDone }) {
  const [value, setValue] = useState(String(product?.stock_quantity ?? 0))
  const toast = useToast()

  const mutation = useAdminMutation({
    fn: () => adjustProductStock(product.id, { quantity: Number(value) }),
    success: (d) => d.detail,
    onDone: () => {
      onDone()
      onClose()
    },
  })

  const quick = (delta) => setValue(String(Math.max(0, Number(value || 0) + delta)))

  return (
    <Modal open={Boolean(product)} onClose={onClose} title={`Stock · ${product?.name || ''}`} size="max-w-sm">
      {product && (
        <div className="space-y-4 p-5">
          <p className="text-sm text-metal-500">
            Current stock: <strong className="tabular-nums text-ink-900">{product.stock_quantity}</strong>
            {product.availability_display ? ` · ${product.availability_display}` : ''}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => quick(-1)} className="btn-outline px-3" aria-label="Decrease by one">
              <Minus className="h-4 w-4" />
            </button>
            <input
              className="input text-center tabular-nums"
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="New stock quantity"
            />
            <button type="button" onClick={() => quick(1)} className="btn-outline px-3" aria-label="Increase by one">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={mutation.isPending || value === '' || Number(value) < 0}
              onClick={() => {
                if (Number(value) < 0) {
                  toast.error('Stock cannot go below zero.')
                  return
                }
                mutation.mutate()
              }}
            >
              {mutation.isPending ? 'Saving…' : 'Save stock'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- product */

function ProductForm({ initial, categories, brands, onClose }) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = Boolean(initial?.id)
  const [form, setForm] = useState({ ...EMPTY, ...initial, specifications: JSON.stringify(initial?.specifications || {}) })
  const [files, setFiles] = useState([])
  const [progress, setProgress] = useState(null)
  const [specError, setSpecError] = useState(null)
  const fileRef = useRef()

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    if (key === 'specifications') setSpecError(null)
  }

  const payload = () => {
    const specifications = parseSpecs(form.specifications)
    return {
      name: form.name,
      sku: form.sku,
      category: form.category ? Number(form.category) : null,
      brand: form.brand ? Number(form.brand) : null,
      product_type: form.product_type,
      price: form.price,
      discount_price: form.discount_price === '' ? null : form.discount_price,
      stock_quantity: Number(form.stock_quantity || 0),
      short_description: form.short_description,
      description: form.description,
      warranty: form.warranty,
      is_active: form.is_active,
      featured: form.featured,
      bestseller: form.bestseller,
      new_arrival: form.new_arrival,
      meta_title: form.meta_title,
      meta_description: form.meta_description,
      specifications,
    }
  }

  const mutation = useAdminMutation({
    fn: async () => {
      const data = payload()
      if (isEdit) return updateAdminProduct(initial.id, data)

      // Multipart create. Every value is appended as a string — appending the
      // `specifications` object directly would upload the text "[object Object]"
      // and the server would reject the product.
      const fd = new FormData()
      Object.entries({ ...data, specifications: JSON.stringify(data.specifications) }).forEach(([k, v]) => {
        if (v !== null && v !== undefined) fd.append(k, typeof v === 'boolean' ? String(v) : v)
      })
      files.forEach((f) => fd.append('images[]', f))
      return createAdminProduct(fd)
    },
    success: isEdit ? 'Product updated.' : 'Product published to the store.',
    invalidate: [['admin-products'], ['admin-stats']],
    onDone: onClose,
  })

  const submit = () => {
    try {
      parseSpecs(form.specifications)
    } catch (e) {
      setSpecError(e.message)
      return
    }
    if (!form.name.trim()) {
      toast.error('A product needs a name.')
      return
    }
    mutation.mutate()
  }

  const upload = async () => {
    if (!files.length) return
    try {
      setProgress(0)
      const keys = await uploadProductImages(initial.id, files, setProgress)
      await updateAdminProduct(initial.id, { uploaded_images: keys })
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      toast.success(`${keys.length} image(s) uploaded.`)
      setFiles([])
    } catch (e) {
      toast.error(e.message || 'Upload failed.')
    } finally {
      setProgress(null)
    }
  }

  const moveImage = (index, delta) => {
    const ids = (initial.images || []).map((img) => img.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderProductImages(initial.id, ids).then(
      () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
      (e) => toast.error(e.message || 'Could not reorder images.'),
    )
  }

  const removeImage = (image) => {
    if (!window.confirm('Delete this image?')) return
    deleteProductImage(initial.id, image.id).then(
      () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
      (e) => toast.error(e.message || 'Could not delete the image.'),
    )
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit · ${initial.name}` : 'New product'} size="max-w-3xl">
      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input className="input" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="SKU" hint={isEdit ? 'The SKU cannot be changed after creation.' : undefined}>
            <input className="input" value={form.sku} onChange={set('sku')} disabled={isEdit} />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={set('category')}>
              <option value="">Choose…</option>
              {categories?.results?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <select className="input" value={form.brand || ''} onChange={set('brand')}>
              <option value="">None</option>
              {brands?.results?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select className="input" value={form.product_type} onChange={set('product_type')}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Price (₦)">
            <input className="input" type="number" min="0" value={form.price} onChange={set('price')} />
          </Field>
          <Field label="Discount price (₦)" hint="Leave blank for no sale.">
            <input className="input" type="number" min="0" value={form.discount_price ?? ''} onChange={set('discount_price')} />
          </Field>
          <Field label="Stock">
            <input className="input" type="number" min="0" value={form.stock_quantity} onChange={set('stock_quantity')} />
          </Field>
          <Field label="Warranty">
            <input className="input" value={form.warranty || ''} onChange={set('warranty')} />
          </Field>
          <Field label="Short description" className="sm:col-span-2">
            <input className="input" value={form.short_description || ''} onChange={set('short_description')} />
          </Field>
          <Field label="Full description" className="sm:col-span-2">
            <textarea rows={3} className="input" value={form.description || ''} onChange={set('description')} />
          </Field>
          <Field
            label="Specifications (JSON)"
            className="sm:col-span-2"
            hint='Key/value pairs shown on the product page, e.g. {"Battery": "5000mAh"}'
            error={specError}
          >
            <input className="input font-mono text-xs" value={form.specifications} onChange={set('specifications')} />
          </Field>
          <Field label="SEO title" className="sm:col-span-2" hint="Falls back to the product name.">
            <input className="input" value={form.meta_title || ''} onChange={set('meta_title')} />
          </Field>
          <Field label="SEO description" className="sm:col-span-2">
            <input className="input" value={form.meta_description || ''} onChange={set('meta_description')} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          {[
            ['is_active', 'Active in store'],
            ['featured', 'Featured'],
            ['bestseller', 'Bestseller'],
            ['new_arrival', 'New arrival'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-ink-800">
              <input type="checkbox" checked={Boolean(form[key])} onChange={set(key)} /> {label}
            </label>
          ))}
        </div>

        {isEdit && (
          <div className="rounded-lg border border-dashed border-line p-3">
            <p className="mb-2 text-xs font-semibold text-ink-800">Images</p>
            {initial.images?.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {initial.images.map((img, i) => (
                  <div key={img.id} className="relative">
                    <img src={img.image} alt={img.alt_text || ''} className="h-16 w-16 rounded object-cover" />
                    {i === 0 && <span className="absolute left-0 top-0 bg-ink-900 px-1 text-[10px] font-semibold text-white">Main</span>}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between">
                      <button type="button" onClick={() => moveImage(i, -1)} className="bg-white/90 px-1 text-xs" aria-label="Move earlier">←</button>
                      <button type="button" onClick={() => moveImage(i, 1)} className="bg-white/90 px-1 text-xs" aria-label="Move later">→</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(img)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-danger shadow"
                      aria-label="Delete image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline">
                <UploadCloud className="h-4 w-4" /> Choose files
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => setFiles([...e.target.files])}
              />
              {files.length > 0 && (
                <button type="button" disabled={progress !== null} onClick={upload} className="btn-accent">
                  {progress === null ? `Upload ${files.length}` : `Uploading ${Math.round(progress * 100)}%`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={mutation.isPending} className="btn-accent">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Publish product'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, hint, error, className = '', children }) {
  return (
    <label className={`block text-[13px] font-semibold text-ink-900 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs font-normal text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs font-normal text-metal-500">{hint}</span> : null}
    </label>
  )
}
