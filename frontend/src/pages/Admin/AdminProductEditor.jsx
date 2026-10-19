import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, UploadCloud, X } from 'lucide-react'

import { AdminPage } from '../../components/Admin/AdminUI'
import { useToast } from '../../context/ToastContext'
import useConfirmAction from '../../hooks/useConfirmAction'
import { cn } from '../../utils/format'
import {
  createAdminProduct, deleteProductImage, fetchAdminBrands, fetchAdminCategories,
  fetchAdminProduct, reorderProductImages, updateAdminProduct, updateProductImage, uploadProductImages,
} from '../../services/adminApi'

const TYPES = ['device', 'computing', 'audio', 'wearable', 'power', 'storage', 'networking', 'accessory', 'gaming', 'security', 'software']

/** Option kinds a variation can be — matches the backend VariantType choices. */
const VARIANT_TYPES = [
  ['color', 'Colour'],
  ['size', 'Size'],
  ['storage', 'Storage'],
  ['ram', 'RAM'],
  ['capacity', 'Capacity'],
  ['model', 'Model'],
]

/** Hosting (Vercel/Cloudinary path) rejects request bodies above 4MB, so any
 *  image over 4MB can never be uploaded — block it at pick time. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const EMPTY = {
  name: '', sku: '', category: '', brand: '', product_type: 'accessory',
  price: '', discount_price: '', stock_quantity: '', short_description: '',
  description: '', warranty: '', specifications: '{}', is_active: true,
  featured: false, bestseller: false, new_arrival: false,
  meta_title: '', meta_description: '',
}
const EMPTY_VARIATION = { variant_type: 'color', value: '', price_adjustment: '0', stock_quantity: '0', color_hex: '' }

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

const typeLabel = (t) => VARIANT_TYPES.find(([value]) => value === t)?.[1] || t

/**
 * Full-page product editor. `productId === null` uploads a new product;
 * otherwise it edits (and manages images for) the existing one.
 *
 * Variations: rows of {type, value, price adjustment, stock, colour swatch}.
 * A row is one purchasable option (the red powerbank, the large size). Photos
 * can be attached to a row so the storefront shows the matching photo when the
 * customer selects that option. Rows without an `id` are created server-side,
 * and their SKUs are auto-generated from the product SKU.
 */
function Editor({ productId }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = Boolean(productId)

  const [form, setForm] = useState({ ...EMPTY })
  const [variations, setVariations] = useState([])
  const [files, setFiles] = useState([]) // { file, variantIndex: row index | '' }
  const [progress, setProgress] = useState(null)
  const [specError, setSpecError] = useState(null)
  const [seeded, setSeeded] = useState(false)
  const confirm = useConfirmAction()
  const fileRef = useRef()

  const { data: categories } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories })
  const { data: brands } = useQuery({ queryKey: ['admin-brands'], queryFn: fetchAdminBrands })
  const { data: product, isLoading } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => fetchAdminProduct(productId),
    enabled: isEdit,
  })

  // Seed the form once the product detail arrives (edit mode only).
  useEffect(() => {
    if (isEdit && product && !seeded) {
      setForm({
        ...EMPTY,
        ...product,
        category: product.category?.id ?? '',
        brand: product.brand?.id ?? '',
        specifications: JSON.stringify(product.specifications || {}),
      })
      setVariations(
        (product.variants || []).map((v) => ({
          ...(v.is_active !== false ? { id: v.id } : {}),
          variant_type: v.variant_type,
          value: v.value,
          price_adjustment: String(Number(v.price_adjustment || 0)),
          stock_quantity: String(v.stock_quantity ?? 0),
          color_hex: v.color_hex || '',
        })),
      )
      setSeeded(true)
    }
  }, [isEdit, product, seeded])

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

  /* ------------------------------------------------------------ variations */
  const updateVariation = (index, key, value) =>
    setVariations((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
  const addVariation = () => setVariations((rows) => [...rows, { ...EMPTY_VARIATION, variant_type: rows[0]?.variant_type || 'color' }])
  const removeVariation = (index) => {
    setVariations((rows) => rows.filter((_, i) => i !== index))
    // Staged files track variation rows by index — re-map after the removal.
    setFiles((staged) =>
      staged.map((f) =>
        f.variantIndex === index
          ? { ...f, variantIndex: '' } // attached to the row that was just deleted
          : f.variantIndex > index
            ? { ...f, variantIndex: f.variantIndex - 1 }
            : f,
      ),
    )
  }

  /** Validated rows for the API, in list order (that order is relied upon by
   *  image_variants, which maps staged files to rows by index). */
  const variationPayload = () =>
    variations.map((r, i) => ({
      ...(r.id ? { id: r.id } : {}),
      variant_type: r.variant_type,
      value: r.value.trim(),
      price_adjustment: r.price_adjustment === '' ? 0 : Number(r.price_adjustment),
      stock_quantity: r.stock_quantity === '' ? 0 : Number(r.stock_quantity),
      color_hex: r.variant_type === 'color' ? (r.color_hex || '') : '',
      display_order: i,
    }))

  const validateVariations = () => {
    const seen = new Set()
    for (const row of variations) {
      if (!row.value.trim()) return 'Every variation needs a value (e.g. Red, Large, 256GB).'
      const key = `${row.variant_type}:${row.value.trim().toLowerCase()}`
      if (seen.has(key)) return `Duplicate variation: “${row.value.trim()}” is listed twice.`
      seen.add(key)
      if (Number(row.price_adjustment || 0) < 0) return 'The extra price of a variation cannot be negative.'
      if (Number(row.stock_quantity || 0) < 0) return 'Variation stock cannot be negative.'
    }
    return null
  }

  /* ---------------------------------------------------------------- payload */
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

  /** Where a staged file should land: the variation row's server id (edit mode,
   *  after the product save returns fresh rows) or null for a general photo. */
  const stagedVariantHandles = (freshVariants) =>
    files.map((f) => {
      const row = variations[f.variantIndex]
      if (!row) return null
      if (!isEdit) return f.variantIndex // create flow maps rows by listed index
      const matched = (freshVariants || []).find(
        (v) => v.variant_type === row.variant_type && String(v.value) === row.value.trim(),
      )
      return matched ? matched.id : null
    })

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
    const variationError = validateVariations()
    if (variationError) {
      setMutationError(variationError)
      toast.error(variationError)
      return
    }
    setMutationError(null)
    setSaving(true)
    try {
      if (isEdit) {
        data.variants = variationPayload()
        const fresh = await updateAdminProduct(productId, data)
        // Staged files must not silently wait for a separate button — upload
        // them as part of saving, then attach the returned keys (linked to
        // their chosen variations where one was selected).
        if (files.length) {
          try {
            const handles = stagedVariantHandles(fresh.variants)
            const keys = await uploadProductImages(productId, files.map((f) => f.file), setProgress)
            const pairings = keys.map((key, i) => (handles[i] == null ? { key } : { key, variant: handles[i] }))
            await updateAdminProduct(productId, { uploaded_images: pairings })
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
        fd.append('variants', JSON.stringify(variationPayload()))
        fd.append('image_variants', JSON.stringify(files.map((f) => (f.variantIndex === '' ? null : f.variantIndex))))
        files.forEach((f) => fd.append('images[]', f.file))
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

  // Deleting a stored product image always asks first.
  const removeImage = (image) =>
    confirm.ask({
      title: 'Delete this image?',
      body: 'Are you sure you want to delete this? The image is removed from the product immediately; other images are untouched.',
      confirmLabel: 'Delete image',
      action: () =>
        deleteProductImage(productId, image.id).then(invalidate, (e) => toast.error(e.message || 'Could not delete the image.')),
    })

  /** Attach/detach a stored image to a variation (immediate save). */
  const linkImage = (image, value) => {
    const variant = value === '' ? null : Number(value)
    updateProductImage(productId, image.id, { variant }).then(
      invalidate,
      () => toast.error('Could not link the image to that variation.'),
    )
  }

  /** Pop the too-large warning the moment an oversized image is selected.
   *  The rejected files never enter the staged list, so publishing cannot fail later on size. */
  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = '' // allow re-picking the same file after a failed pick
    const oversize = picked.filter((f) => f.size > MAX_IMAGE_BYTES)
    const acceptable = picked.filter((f) => f.size <= MAX_IMAGE_BYTES)
    if (oversize.length) {
      const listing = oversize.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ')
      toast.error(
        oversize.length === 1 ? 'Image too large — 4MB limit' : `${oversize.length} images too large — 4MB limit`,
        `Images above 4MB can't be uploaded (our host enforces a 4MB limit). Please compress ${listing} to 4MB or less and pick it again.`,
      )
    }
    if (acceptable.length) {
      setFiles((prev) => [...prev, ...acceptable.map((file) => ({ file, variantIndex: '' }))])
    }
  }

  if (isEdit && isLoading) {
    return (
      <AdminPage title="Edit product" description="Loading the product…">
        <p className="text-sm text-metal-500">Loading product…</p>
      </AdminPage>
    )
  }

  const variationOptions = variations
    .map((r, i) => ({ index: i, label: typeLabel(r.variant_type), value: r.value.trim() }))
    .filter((o) => o.value)

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
          <Field
            label="Stock"
            hint={variations.length ? 'Base stock — each variation keeps its own stock below.' : undefined}
          >
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

        {/* ------------------------------------------------------- variations */}
        <div className="mt-6 rounded-lg border border-dashed border-line p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-800">Variations</p>
            <button type="button" onClick={addVariation} className="btn-outline px-3 py-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add variation
            </button>
          </div>
          <p className="mt-1 text-xs text-metal-500">
            Options the customer picks before adding to cart — colours, sizes, storage… Each option gets
            its own stock and can add to the base price. Leave empty for a one-standard product.
          </p>
          {variations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {variations.map((row, index) => (
                <li key={row.id ?? `new-${index}`} className="grid items-end gap-2 rounded-md bg-metal-50 p-2 sm:grid-cols-[130px_1fr_90px_110px_44px_auto]">
                  <select
                    className="input py-1.5 text-[13px]"
                    value={row.variant_type}
                    onChange={(e) => updateVariation(index, 'variant_type', e.target.value)}
                    aria-label="Variation kind"
                  >
                    {VARIANT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input
                    className="input py-1.5 text-[13px]"
                    placeholder={row.variant_type === 'color' ? 'Red, Blue…' : row.variant_type === 'size' ? 'Small, Medium, Large…' : 'e.g. 256GB'}
                    value={row.value}
                    onChange={(e) => updateVariation(index, 'value', e.target.value)}
                    aria-label="Variation value"
                  />
                  <input
                    className="input py-1.5 text-center text-[13px] tabular-nums"
                    type="number" min="0"
                    value={row.stock_quantity}
                    onChange={(e) => updateVariation(index, 'stock_quantity', e.target.value)}
                    aria-label="Variation stock"
                    title="Stock of this option"
                  />
                  <input
                    className="input py-1.5 text-center text-[13px] tabular-nums"
                    type="number"
                    value={row.price_adjustment}
                    onChange={(e) => updateVariation(index, 'price_adjustment', e.target.value)}
                    aria-label="Extra price"
                    title="Extra price added to the base price"
                  />
                  <input
                    className={cn('h-8 w-11 cursor-pointer rounded border border-line bg-white p-0.5', row.variant_type !== 'color' && 'hidden')}
                    type="color"
                    value={row.color_hex || '#111827'}
                    onChange={(e) => updateVariation(index, 'color_hex', e.target.value)}
                    aria-label="Colour swatch"
                    title="Swatch colour shown on the option button"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariation(index)}
                    className="rounded p-1.5 text-danger transition hover:bg-red-50"
                    aria-label={`Remove ${row.value || 'this variation'}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
              <li className="text-[11px] text-metal-400">
                Columns: kind · option · stock · extra price (₦, added to base) · swatch.
                {isEdit ? ' Removed options are hidden from the store; past orders keep their records.' : ''}
              </li>
            </ul>
          )}
        </div>

        {/* ----------------------------------------------------------- images */}
        <div className="mt-4 rounded-lg border border-dashed border-line p-4">
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
                  {variationOptions.some((o) => variations[o.index].id) && (
                    <select
                      className="mt-1 w-24 rounded border border-line bg-white px-1 py-0.5 text-[11px]"
                      value={img.variant ?? ''}
                      onChange={(e) => linkImage(img, e.target.value)}
                      title="Show this photo when the customer picks an option"
                    >
                      <option value="">General photo</option>
                      {variationOptions
                        .filter((o) => variations[o.index].id)
                        .map((o) => (
                          <option key={o.index} value={variations[o.index].id}>{o.label}: {o.value}</option>
                        ))}
                    </select>
                  )}
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
              onChange={pickFiles}
            />
            {progress !== null && <span className="text-xs font-medium text-ink-700">Uploading {Math.round(progress * 100)}%…</span>}
          </div>
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {files.map((f, i) => {
                const tooLarge = f.file.size > MAX_IMAGE_BYTES
                return (
                  <li
                    key={`${f.file.name}-${i}`}
                    className={cn(
                      'flex items-center gap-1.5 rounded bg-metal-50 px-2 py-1 text-ink-700',
                      tooLarge && 'border border-red-200 bg-red-50 text-red-700',
                    )}
                  >
                    {f.file.name}
                    {tooLarge && <span className="font-semibold">(too large)</span>}
                    {variationOptions.length > 0 && !tooLarge && (
                      <select
                        className="rounded border border-line bg-white px-1 py-0.5 text-[11px]"
                        value={f.variantIndex}
                        onChange={(e) =>
                          setFiles((staged) =>
                            staged.map((st, j) => (j === i ? { ...st, variantIndex: e.target.value === '' ? '' : Number(e.target.value) } : st)),
                          )
                        }
                        title="Attach this photo to a variation"
                      >
                        <option value="">General photo</option>
                        {variationOptions.map((o) => (
                          <option key={o.index} value={o.index}>{o.label}: {o.value}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-danger"
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {files.some((f) => f.file.size > MAX_IMAGE_BYTES) && (
            <p className="mt-2 text-xs text-danger">One or more files exceed the 4MB limit. Remove or compress them before uploading.</p>
          )}
          <p className="mt-2 text-xs text-metal-500">
            {isEdit
              ? 'The first image becomes the product thumbnail. Attach a photo to a variation so it shows when that option is picked.'
              : 'JPG, PNG or WebP up to 4MB each — attach them to your variations before publishing and customers see the matching photo per option.'}
          </p>
        </div>

        {mutationError && (
          <p className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{mutationError}</p>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
          <Link to="/admin/products" className="btn-outline">Cancel</Link>
          <button
            type="button"
            disabled={saving || confirm.busy}
            className="btn-accent"
            onClick={() =>
              confirm.ask({
                title: isEdit ? 'Save these changes?' : 'Publish this product?',
                body: isEdit
                  ? `Are you sure you want to save this? Every change to “${form.name}” goes live in the store the moment you confirm.`
                  : `Are you sure you want to save this? “${form.name}” will be published to the store immediately.`,
                confirmLabel: isEdit ? 'Save changes' : 'Publish product',
                tone: 'primary',
                action: save,
              })
            }
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Publish product'}
          </button>
        </div>
      </div>

      {confirm.modal}
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
