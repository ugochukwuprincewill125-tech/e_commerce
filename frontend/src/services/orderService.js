import api from './api'

export const orderService = {
  list: (params) => api.get('/orders/', { params }).then((r) => r.data),
  detail: (orderNumber) => api.get(`/orders/${orderNumber}/`).then((r) => r.data),
  create: (payload) => api.post('/orders/', payload).then((r) => r.data),
  cancel: (orderNumber) => api.post(`/orders/${orderNumber}/cancel/`).then((r) => r.data),
  track: (payload) => api.post('/orders/track/', payload).then((r) => r.data),
}

export const paymentService = {
  config: () => api.get('/payments/config/').then((r) => r.data),
  initialize: (orderNumber) => api.post('/payments/initialize/', { order_number: orderNumber }).then((r) => r.data),
  verify: (reference) => api.get(`/payments/verify/${encodeURIComponent(reference)}/`).then((r) => r.data),
}
