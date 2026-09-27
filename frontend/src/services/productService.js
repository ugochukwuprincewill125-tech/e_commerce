import api from './api'

function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)),
  )
}

export const productService = {
  list: (params) => api.get('/products/', { params: clean(params) }).then((r) => r.data),
  detail: (slug) => api.get(`/products/${slug}/`).then((r) => r.data),
  related: (slug) => api.get(`/products/${slug}/related/`).then((r) => r.data),
  facets: (params) => api.get('/products/facets/', { params: clean(params) }).then((r) => r.data),
  bySlugs: (slugs) =>
    slugs.length
      ? api.get('/products/', { params: { slugs: slugs.join(','), page_size: slugs.length } }).then((r) => r.data.results)
      : Promise.resolve([]),
  suggestions: (q, signal) => api.get('/search/suggestions/', { params: { q }, signal }).then((r) => r.data),
}

export const catalogService = {
  categories: (params) => api.get('/categories/', { params }).then((r) => r.data),
  category: (slug) => api.get(`/categories/${slug}/`).then((r) => r.data),
  brands: (params) => api.get('/brands/', { params }).then((r) => r.data),
  brand: (slug) => api.get(`/brands/${slug}/`).then((r) => r.data),
}

export const storeService = {
  info: () => api.get('/store-info/').then((r) => r.data),
  contact: (payload) => api.post('/contact/', payload).then((r) => r.data),
}

export const reviewService = {
  list: (params) => api.get('/reviews/', { params }).then((r) => r.data),
  eligibility: (product) => api.get('/reviews/eligibility/', { params: { product } }).then((r) => r.data),
  create: (payload) => api.post('/reviews/', payload).then((r) => r.data),
}
