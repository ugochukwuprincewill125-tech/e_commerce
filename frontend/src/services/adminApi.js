import api from '../services/api'
import { tokens } from '../services/api'

const enabled = () => Boolean(tokens.access)

/* ------------------------------- dashboard ------------------------------ */
export const fetchStats = () => (enabled() ? api.get('/admin-api/stats/').then((r) => r.data) : Promise.reject(new Error('Not signed in')))

/* -------------------------------- products ------------------------------ */
export const fetchAdminProducts = (params) =>
  enabled() ? api.get('/admin-api/products/', { params }).then((r) => r.data) : Promise.reject(new Error('Not signed in'))
export const fetchAdminProduct = (id) =>
  api.get(`/admin-api/products/${id}/`).then((r) => r.data)
export const createAdminProduct = (formData) =>
  api.post('/admin-api/products/', formData).then((r) => r.data)
export const updateAdminProduct = (id, payload) =>
  api.patch(`/admin-api/products/${id}/`, payload).then((r) => r.data)
export const deleteAdminProduct = (id) =>
  api.delete(`/admin-api/products/${id}/`).then((r) => r.data)
export const restoreAdminProduct = (id) =>
  api.post(`/admin-api/products/${id}/restore/`).then((r) => r.data)
/** Hard delete — permanent; only sensible for already-archived products. */
export const deleteAdminProductForever = (id) =>
  api.post(`/admin-api/products/${id}/delete_forever/`).then((r) => r.data)

/**
 * Product image upload. Asks the server to sign a batch of files (tiny JSON
 * request), PUTs each file to its upload URL — same-origin (JWT applies) or a
 * foreign CDN URL (no Authorization header allowed) — and returns the keys to
 * attach to the product via uploaded_images.
 */
export async function uploadProductImages(productId, files, onProgress) {
  if (!files?.length) return []
  const items = files.map((f) => ({ filename: f.name, content_type: f.type || 'image/jpeg', product_id: productId }))
  const { uploads } = await api.post('/admin-api/uploads/sign/', { items }).then((r) => r.data)

  const keys = []
  const apiOrigin = new URL(api.defaults.baseURL || window.location.origin, window.location.origin).origin
  for (let i = 0; i < uploads.length; i += 1) {
    const signed = uploads[i]
    const file = files[i]
    // Same-origin upload URLs live on our API and need the JWT (raw fetch
    // bypasses the axios interceptor, so set it here); foreign upload URLs
    // must not carry our Authorization header at all.
    const isLocal = new URL(signed.upload_url, window.location.origin).origin === apiOrigin
    const headers = { ...signed.headers }
    if (isLocal) headers.Authorization = `Bearer ${tokens.access}`
    else delete headers.Authorization
    const response = await fetch(signed.upload_url, { method: 'PUT', headers, body: file })
    if (!response.ok) throw new Error(`Upload failed (${response.status})`)
    keys.push(signed.key)
    onProgress?.((i + 1) / uploads.length)
  }
  return keys
}

/** Nudge or set a product's stock after a delivery or a stock count. */
export const adjustProductStock = (id, payload) =>
  api.post(`/admin-api/products/${id}/adjust_stock/`, payload).then((r) => r.data)
export const setProductFeatured = (id, featured) =>
  api.post(`/admin-api/products/${id}/set_featured/`, { featured }).then((r) => r.data)
export const fetchLowStock = (params) => api.get('/admin-api/products/low_stock/', { params }).then((r) => r.data)
export const reorderProductImages = (productId, imageIds) =>
  api.post(`/admin-api/products/${productId}/images/reorder/`, { image_ids: imageIds }).then((r) => r.data)
export const deleteProductImage = (productId, imageId) =>
  api.delete(`/admin-api/products/${productId}/images/${imageId}/`).then((r) => r.data)
export const updateProductImage = (productId, imageId, payload) =>
  api.patch(`/admin-api/products/${productId}/images/${imageId}/`, payload).then((r) => r.data)

/* ---------------------------- categories/brands --------------------------- */
export const fetchAdminCategories = () => api.get('/admin-api/categories/').then((r) => r.data)
export const createAdminCategory = (payload) => api.post('/admin-api/categories/', payload).then((r) => r.data)
export const updateAdminCategory = (id, payload) => api.patch(`/admin-api/categories/${id}/`, payload).then((r) => r.data)
export const deleteAdminCategory = (id) => api.delete(`/admin-api/categories/${id}/`).then((r) => r.data)

export const fetchAdminBrands = () => api.get('/admin-api/brands/').then((r) => r.data)
export const createAdminBrand = (payload) => api.post('/admin-api/brands/', payload).then((r) => r.data)
export const updateAdminBrand = (id, payload) => api.patch(`/admin-api/brands/${id}/`, payload).then((r) => r.data)
export const deleteAdminBrand = (id) => api.delete(`/admin-api/brands/${id}/`).then((r) => r.data)

/* --------------------------------- orders --------------------------------- */
export const fetchAdminOrders = (params) => api.get('/admin-api/orders/', { params }).then((r) => r.data)
export const fetchAdminOrder = (id) => api.get(`/admin-api/orders/${id}/`).then((r) => r.data)
export const setOrderStatus = (id, payload) => api.patch(`/admin-api/orders/${id}/status/`, payload).then((r) => r.data)
export const setOrderPayment = (id, payload) => api.patch(`/admin-api/orders/${id}/payment/`, payload).then((r) => r.data)
/** Log the courier reference for a parcel; `mark_shipped` closes the fulfilment step. */
export const setOrderTracking = (id, payload) => api.patch(`/admin-api/orders/${id}/tracking/`, payload).then((r) => r.data)
export const refundOrder = (id, payload) => api.post(`/admin-api/orders/${id}/refund/`, payload).then((r) => r.data)

/* -------------------------------- customers ------------------------------- */
export const fetchAdminCustomers = (params) => api.get('/admin-api/customers/', { params }).then((r) => r.data)
export const fetchAdminCustomer = (id) => api.get(`/admin-api/customers/${id}/`).then((r) => r.data)
export const updateAdminCustomer = (id, payload) => api.patch(`/admin-api/customers/${id}/`, payload).then((r) => r.data)
export const setCustomerActive = (id, is_active) => api.post(`/admin-api/customers/${id}/set_active/`, { is_active }).then((r) => r.data)
/** Superuser-only on the server: promotes or demotes a staff member. */
export const setCustomerStaff = (id, is_staff) => api.post(`/admin-api/customers/${id}/set_staff/`, { is_staff }).then((r) => r.data)

/* --------------------------- reviews & messages --------------------------- */
export const fetchAdminReviews = (params) => api.get('/admin-api/reviews/', { params }).then((r) => r.data)
export const approveAdminReview = (id, is_approved) => api.patch(`/admin-api/reviews/${id}/approve/`, { is_approved }).then((r) => r.data)
export const deleteAdminReview = (id) => api.delete(`/admin-api/reviews/${id}/`).then((r) => r.data)
export const fetchAdminMessages = (params) => api.get('/admin-api/messages/', { params }).then((r) => r.data)
export const resolveAdminMessage = (id, is_resolved) => api.post(`/admin-api/messages/${id}/resolve/`, { is_resolved }).then((r) => r.data)

/* --------------------------------- coupons -------------------------------- */
export const fetchAdminCoupons = () => api.get('/admin-api/coupons/').then((r) => r.data)
export const createAdminCoupon = (payload) => api.post('/admin-api/coupons/', payload).then((r) => r.data)
export const updateAdminCoupon = (id, payload) => api.patch(`/admin-api/coupons/${id}/`, payload).then((r) => r.data)
export const deleteAdminCoupon = (id) => api.delete(`/admin-api/coupons/${id}/`).then((r) => r.data)

/* --------------------------------- reports -------------------------------- */
export const fetchAdminReports = (params) => api.get('/admin-api/reports/', { params }).then((r) => r.data)
