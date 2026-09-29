import api, { tokens } from './api'

export const authService = {
  async login(email, password) {
    const { data } = await api.post('/auth/login/', { email, password })
    tokens.set({ access: data.access, refresh: data.refresh })
    return data.user
  },
  async register(payload) {
    const { data } = await api.post('/auth/register/', payload)
    tokens.set({ access: data.access, refresh: data.refresh })
    return data
  },
  async logout() {
    const refresh = tokens.refresh
    try {
      if (refresh) await api.post('/auth/logout/', { refresh })
    } finally {
      tokens.clear()
    }
  },
  me: () => api.get('/users/profile/').then((r) => r.data),
  updateProfile: (payload) => {
    if (payload instanceof FormData) {
      return api.patch('/users/profile/', payload).then((r) => r.data)
    }
    return api.patch('/users/profile/', payload).then((r) => r.data)
  },
  changePassword: async (payload) => {
    await api.post('/auth/change-password/', payload)
    tokens.clear()
    window.dispatchEvent(new Event('tgs:logout'))
  },
  forgotPassword: (email) => api.post('/auth/password-reset/', { email }).then((r) => r.data),
  resetPassword: (payload) => api.post('/auth/password-reset/confirm/', payload).then((r) => r.data),
  verifyEmail: (uid, token) => api.post('/auth/verify-email/', { uid, token }).then((r) => r.data),
  resendVerification: () => api.post('/auth/resend-verification/').then((r) => r.data),
}

export const userService = {
  dashboard: () => api.get('/users/dashboard/').then((r) => r.data),
  addresses: () => api.get('/users/addresses/').then((r) => r.data),
  createAddress: (payload) => api.post('/users/addresses/', payload).then((r) => r.data),
  updateAddress: (id, payload) => api.patch(`/users/addresses/${id}/`, payload).then((r) => r.data),
  deleteAddress: (id) => api.delete(`/users/addresses/${id}/`),
}
