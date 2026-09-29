import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, UploadCloud, X } from 'lucide-react'

import { AdminPage } from '../../components/Admin/AdminUI'
import { useToast } from '../../context/ToastContext'
import {
  createAdminProduct, deleteProductImage, fetchAdminBrands, fetchAdminCategories,
  fetchAdminProduct, reorderProductImages, updateAdminProduct, uploadProductImages,
} from '../../services/adminApi'

const TYPES = ['device', 'computing', 'audio', 'wearable', 'power', 'storage', 'networking', 'accessory', 'gaming', 'security', 'software']

const EMPTY = {
  name: '', sku: '', category: '', brand: '', product_type: 'accessory',
  price: '', discount_price: '', stock_quantity: '', short_description: '',
  description: '', warranty: '', specifications: '{}', is_active: true,
  featured: false, bestseller: false, new_arrival: false,
  meta_title: '', meta_description: '',
}

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

/**
 * Full-page product editor. `productId === null` uploads a new product;
 * otherwise it edits (and manages images for) the existing one. Extracted
 * from the old modal so "Upload product" is a first-class tab in the sidebar
 * and every edit has room to breathe.
 */
function Editor({ productId }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = Boolean(productId)

  const [form, setForm] = useState({ ...EMPTY })
  const [files, setFiles] = useState([])
  const [progress, setProgress] = useState(null)
  const [specError, setSpecError] = useState(null)
  const [seeded, setSeeded] = useState(false)
  const fileRef = useRef()

  const { data: categories } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories })
  const { data: brands } = useQuery({ queryKey: ['admin-brands'], queryFn: fetchAdminBrands })
  const { data: product, isLoading } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => fetchAdminProduct(productId),
    enabled: isEdit,
  })

  // Seed the form once the product detail arrives (edit mode only).
  if (isEdit && product && !seeded) {
    setForm({
      ...EMPTY,
      ...product,
      category: product.category?.id ?? '',
      brand: product.brand?.id ?? '',
      specifications: JSON.stringify(product.specifications || {}),
    })
    setSeeded(true)
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-products'] })
    qc.invalidateQueries({ queryKey: ['admin-product', productId] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

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

  const [mutationError, setMutationError] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    let data
    try {
      data = payload()
    } catch (e) {
      setSpecError(e.message)
      return
    }
    if (!form.name.trim()) {
      toast.error('A product needs a name.')
      return
    }
    setMutationError(null)
    setSaving(true)
    try {
      if (isEdit) {
        await updateAdminProduct(productId, data)
        // Staged files must not silently wait for a separate button — upload
        // them as part of saving, then attach the returned keys.
        if (files.length) {
          try {
            const keys = await uploadProductImages(productId, files, setProgress)
            await updateAdminProduct(productId, { uploaded_images: keys })
            setFiles([])
            toast.success(`Product updated — ${keys.length} image(s) uploaded.`)
          } catch (e) {
            // The product itself is saved; stay here so the files can be retried.
            setProgress(null)
            setMutationError('Product saved, but the image upload failed. Choose the files again and press “Save changes” to retry.')
            toast.error('Product saved, but the image upload failed.')
            return
          }
        } else {
          toast.success('Product updated — live in the store.')
        }
      } else {
        const fd = new FormData()
        Object.entries({ ...data, specifications: JSON.stringify(data.specifications) }).forEach(([k, v]) => {
          if (v !== null && v !== undefined) fd.append(k, typeof v === 'boolean' ? String(v) : v)
        })
        files.forEach((f) => fd.append('images[]', f))
        await createAdminProduct(fd)
        toast.success('Product published to the store.')
      }
      invalidate()
      navigate('/admin/products')
    } catch (e) {
      const detail = e?.response?.data
      const message = typeof detail === 'string' ? detail : Object.entries(detail || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ') || e.message
      setMutationError(message)
      toast.error('Could not save the product.')
    } finally {
      setSaving(false)
    }
  }

  const moveImage = (index, delta) => {
    const ids = (product.images || []).map((img) => img.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderProductImages(productId, ids).then(invalidate, (e) => toast.error(e.message || 'Could not reorder images.'))
  }

  const removeImage = (image) => {
    if (!window.confirm('Delete this image?')) return
    deleteProductImage(productId, image.id).then(invalidate, (e) => toast.error(e.message || 'Could not delete the image.'))
  }

  if (isEdit && isLoading) {
    return (
      <AdminPage title="Edit product" description="Loading the product…">
        <p className="text-sm text-metal-500">Loading product…</p>
      </AdminPage>
    )
  }

  return (
    <AdminPage
      title={isEdit ? 'Edit product' : 'Upload product'}
      description={isEdit
        ? 'Changes go live in the store the moment you save.'
        : 'Fill in the details — customers see the product as soon as it is published.'}
      actions={
        <Link to="/admin/products" className="btn-outline">
          <ArrowLeft className="h-4 w-4" /> Back to products
        </Link>
      }
    >
      <div className="card p-5 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input className="input" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="SKU" hint={isEdit ? 'The SKU cannot be changed after creation.' : 'Unique stock code, e.g. TGS-LAP-001.'}>
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
            <input className="input font-mono" value={form.specifications} onChange={set('specifications')} />
          </Field>
          <Field label="SEO title" className="sm:col-span-2" hint="Falls back to the product name.">
            <input className="input" value={form.meta_title || ''} onChange={set('meta_title')} />
          </Field>
          <Field label="SEO description" className="sm:col-span-2">
            <input className="input" value={form.meta_description || ''} onChange={set('meta_description')} />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-4 text-sm">
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

        <div className="mt-6 rounded-lg border border-dashed border-line p-4">
          <p className="mb-2 text-xs font-semibold text-ink-800">Images</p>
          {product?.images?.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {product.images.map((img, i) => (
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
            {progress !== null && <span className="text-xs font-medium text-ink-700">Uploading {Math.round(progress * 100)}%…</span>}
          </div>
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded bg-metal-50 px-2 py-1 text-ink-700">
                  {f.name}
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-danger"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-metal-500">
            {isEdit
              ? 'The first image becomes the product thumbnail.'
              : 'JPG, PNG or WebP up to 5MB each — they are attached when you publish the product.'}
          </p>
        </div>

        {mutationError && (
          <p className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{mutationError}</p>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
          <Link to="/admin/products" className="btn-outline">Cancel</Link>
          <button type="button" onClick={save} disabled={saving} className="btn-accent">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Publish product'}
          </button>
        </div>
      </div>
    </AdminPage>
  )
}

export function AdminProductNew() {
  return <Editor productId={null} />
}

export function AdminProductEdit() {
  const { id } = useParams()
  return <Editor productId={Number(id)} />
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
