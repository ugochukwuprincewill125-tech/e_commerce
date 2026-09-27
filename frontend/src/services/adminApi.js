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

/**
 * Direct-to-Backblaze upload. Signs a batch of files (tiny JSON request —
 * serverless-safe), PUTs each file straight to B2 with its required headers,
 * and returns the keys to attach to the product via uploaded_images.
 */
export async function uploadProductImages(productId, files, onProgress) {
  if (!files?.length) return []
  const items = files.map((f) => ({ filename: f.name, content_type: f.type || 'image/jpeg', product_id: productId }))
  const { uploads } = await api.post('/admin-api/uploads/sign/', { items }).then((r) => r.data)

  const keys = []
  for (let i = 0; i < uploads.length; i += 1) {
    const signed = uploads[i]
    const file = files[i]
    // Local fallback URLs live on our API and need the JWT (interceptor adds it).
    const isLocal = signed.storage === 'local'
    const headers = { ...signed.headers }
    if (!isLocal) headers.Authorization = undefined // presigned URL must stay unmodified
    await fetch(signed.upload_url, { method: 'PUT', headers, body: file })
    keys.push(signed.key)
    onProgress?.((i + 1) / uploads.length)
  }
  return keys
}

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

/* -------------------------------- customers ------------------------------- */
export const fetchAdminCustomers = (params) => api.get('/admin-api/customers/', { params }).then((r) => r.data)
export const fetchAdminCustomer = (id) => api.get(`/admin-api/customers/${id}/`).then((r) => r.data)
export const updateAdminCustomer = (id, payload) => api.patch(`/admin-api/customers/${id}/`, payload).then((r) => r.data)
export const setCustomerActive = (id, is_active) => api.post(`/admin-api/customers/${id}/set_active/`, { is_active }).then((r) => r.data)

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
