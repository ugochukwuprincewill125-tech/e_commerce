import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Minus, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  AdminCard, AdminEmpty, AdminError, AdminPage, ConfirmDialog, ExportButton,
  TableFooter, exportCsv, useAdminMutation,
} from '../../components/Admin/AdminUI'
import Modal from '../../components/Modal/Modal'
import useDebounce from '../../hooks/useDebounce'
import { useToast } from '../../context/ToastContext'
import { formatNaira } from '../../utils/format'
import {
  adjustProductStock, deleteAdminProduct, fetchAdminCategories,
  fetchAdminProducts, restoreAdminProduct,
} from '../../services/adminApi'

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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
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
      description="Everything in the catalogue. Editing happens on the product's own page."
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
          <button type="button" onClick={() => navigate('/admin/products/new')} className="btn-accent">
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
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/products/${p.id}/edit`)}
                            className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50"
                            title="Edit"
                            aria-label={`Edit ${p.name}`}
                          >
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

function Field({ label, hint, error, className = '', children }) {
  return (
    <label className={`block text-[13px] font-semibold text-ink-900 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs font-normal text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs font-normal text-metal-500">{hint}</span> : null}
    </label>
  )
}
