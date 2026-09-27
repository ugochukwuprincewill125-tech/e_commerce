import api from './api'

export const cartService = {
  get: () => api.get('/cart/').then((r) => r.data),
  add: (productId, quantity = 1, variantId = null) =>
    api.post('/cart/items/', { product_id: productId, quantity, variant_id: variantId }).then((r) => r.data),
  update: (itemId, quantity) => api.patch(`/cart/items/${itemId}/`, { quantity }).then((r) => r.data),
  remove: (itemId) => api.delete(`/cart/items/${itemId}/`).then((r) => r.data),
  clear: () => api.delete('/cart/').then((r) => r.data),
  merge: (sessionId) => api.post('/cart/merge/', { session_id: sessionId }).then((r) => r.data),
  quote: (payload) => api.post('/cart/quote/', payload).then((r) => r.data),
  applyCoupon: (payload) => api.post('/coupons/apply/', payload).then((r) => r.data),
}

export const wishlistService = {
  get: () => api.get('/wishlist/').then((r) => r.data),
  add: (productId) => api.post('/wishlist/', { product_id: productId }).then((r) => r.data),
  remove: (productId) => api.delete(`/wishlist/${productId}/`).then((r) => r.data),
  moveToCart: (productId) => api.post(`/wishlist/${productId}/move-to-cart/`).then((r) => r.data),
}
