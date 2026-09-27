import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, RotateCcw, Search, Trash2, UploadCloud, X } from 'lucide-react'

import useDebounce from '../../hooks/useDebounce'
import { useToast } from '../../context/ToastContext'
import { formatNaira } from '../../utils/format'
import {
  createAdminProduct, deleteAdminProduct, fetchAdminCategories, fetchAdminBrands,
  fetchAdminProducts, restoreAdminProduct, updateAdminProduct, uploadProductImages,
} from '../../services/adminApi'

const EMPTY = {
  name: '', sku: '', category: '', brand: '', product_type: 'accessory',
  price: '', discount_price: '', stock_quantity: '', short_description: '',
  description: '', warranty: '', specifications: '{}', is_active: true,
  featured: false, bestseller: false, new_arrival: false,
}

function ProductForm({ initial, categories, brands, onClose }) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = Boolean(initial?.id)
  const [form, setForm] = useState({ ...EMPTY, ...initial, specifications: JSON.stringify(initial?.specifications || {}) })
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await updateAdminProduct(initial.id, {
          name: form.name, sku: form.sku, category: Number(form.category),
          brand: form.brand ? Number(form.brand) : null,
          product_type: form.product_type, price: form.price,
          discount_price: form.discount_price === '' ? null : form.discount_price,
          stock_quantity: Number(form.stock_quantity || 0),
          short_description: form.short_description, description: form.description,
          warranty: form.warranty, is_active: form.is_active, featured: form.featured,
          bestseller: form.bestseller, new_arrival: form.new_arrival,
          specifications: JSON.parse(form.specifications || '{}'),
        })
      } else {
        const fd = new FormData()
        Object.entries({ ...form, category: form.category, specifications: JSON.parse(form.specifications || '{}') })
          .forEach(([k, v]) => fd.append(k, v ?? ''))
        files.forEach((f) => fd.append('images[]', f))
        return createAdminProduct(fd)
      }
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.push(isEdit ? 'Product updated.' : 'Product published to the store.')
      onClose()
    },
    onError: (e) => toast.push(e.response?.data?.detail || 'Could not save the product.'),
  })

  const addDirectUploads = async () => {
    if (!files.length || !initial?.id) return
    setUploading(true)
    try {
      const keys = await uploadProductImages(initial.id, files)
      await updateAdminProduct(initial.id, { uploaded_images: keys })
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      toast.push(`${keys.length} image(s) uploaded to Backblaze.`)
      setFiles([])
    } catch (e) {
      toast.push(e.response?.data?.detail || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{isEdit ? `Edit: ${initial.name}` : 'New product'}</h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2">Name<input className="input" value={form.name} onChange={set('name')} /></label>
          <label>SKU<input className="input" value={form.sku} onChange={set('sku')} disabled={isEdit} /></label>
          <label>Category
            <select className="input" value={form.category} onChange={set('category')}>
              <option value="">Choose…</option>
              {categories?.results?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Brand
            <select className="input" value={form.brand || ''} onChange={set('brand')}>
              <option value="">None</option>
              {brands?.results?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>Type
            <select className="input" value={form.product_type} onChange={set('product_type')}>
              {['device','computing','audio','wearable','power','storage','networking','accessory','gaming','security','software'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Price (₦)<input className="input" type="number" value={form.price} onChange={set('price')} /></label>
          <label>Discount (₦)<input className="input" type="number" value={form.discount_price ?? ''} onChange={set('discount_price')} /></label>
          <label>Stock<input className="input" type="number" value={form.stock_quantity} onChange={set('stock_quantity')} /></label>
          <label className="col-span-2">Short description<input className="input" value={form.short_description} onChange={set('short_description')} /></label>
          <label className="col-span-2">Full description<textarea rows={3} className="input" value={form.description} onChange={set('description')} /></label>
          <label>Warranty<input className="input" value={form.warranty} onChange={set('warranty')} /></label>
          <label>Specifications (JSON)<input className="input" value={form.specifications} onChange={set('specifications')} /></label>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {[['is_active', 'Active in store'], ['featured', 'Featured'], ['bestseller', 'Bestseller'], ['new_arrival', 'New arrival']].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form[k])} onChange={set(k)} /> {label}</label>
          ))}
        </div>

        {isEdit && (
          <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-3">
            <p className="mb-2 text-xs font-semibold text-neutral-600">
              Images — files go straight to Backblaze (up to 10MB each, JPEG/PNG/WebP/AVIF)
            </p>
            {initial.images?.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {initial.images.map((img) => (
                  <img key={img.id} src={img.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline flex items-center gap-2 text-sm">
                <UploadCloud className="h-4 w-4" /> Choose files
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles([...e.target.files])} />
              {files.length > 0 && (
                <button type="button" disabled={uploading} onClick={addDirectUploads} className="btn-accent text-sm">
                  {uploading ? 'Uploading…' : `Upload ${files.length} to Backblaze`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-accent">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Publish product'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminProducts() {
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState(null)
  const debounced = useDebounce(search)

  const params = { search: debounced || undefined, is_active: archived ? 'false' : 'true', page_size: 24 }
  const { data, isLoading } = useQuery({ queryKey: ['admin-products', params], queryFn: () => fetchAdminProducts(params) })
  const { data: categories } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories })
  const { data: brands } = useQuery({ queryKey: ['admin-brands'], queryFn: fetchAdminBrands })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-products'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  const del = useMutation({
    mutationFn: deleteAdminProduct,
    onSuccess: (d) => { invalidate(); toast.push(d.detail || 'Archived.') },
  })
  const restore = useMutation({
    mutationFn: restoreAdminProduct,
    onSuccess: () => { invalidate(); toast.push('Product restored.') },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink-950">Products</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
            <input className="input w-56 pl-8" placeholder="Search name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setArchived((v) => !v)} className={`btn-outline text-sm ${archived ? 'bg-neutral-200' : ''}`}>
            {archived ? 'Viewing archive' : 'View archive'}
          </button>
          <button onClick={() => setEditing({})} className="btn-accent flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> New product
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading products…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th />
              </tr>
            </thead>
            <tbody>
              {data?.results?.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="flex items-center gap-3 p-3">
                    {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-neutral-500">{p.sku}</p>
                    </div>
                  </td>
                  <td>{p.category?.name}</td>
                  <td className="tabular-nums">
                    {formatNaira(p.current_price)}
                    {p.discount_price && <span className="ml-1 text-xs text-neutral-400 line-through">{formatNaira(p.price)}</span>}
                  </td>
                  <td className="tabular-nums">{p.stock_quantity}</td>
                  <td className="space-x-1 text-[11px]">
                    {p.featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold">Featured</span>}
                    {p.bestseller && <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold">Bestseller</span>}
                    {!p.is_active && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold">Archived</span>}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {p.is_active ? (
                      <button onClick={() => del.mutate(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Archive (soft delete)">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => restore.mutate(p.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Restore">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => setEditing(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {data?.results?.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-neutral-500">
                  {archived ? 'The archive is empty.' : 'No products yet — click "New product" to publish your first item.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductForm
          initial={editing.id ? editing : null}
          categories={categories}
          brands={brands}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
