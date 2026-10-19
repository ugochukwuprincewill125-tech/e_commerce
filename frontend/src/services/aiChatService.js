import api from './api'

function getDevice() {
  if (typeof window === 'undefined') return 'desktop'
  return window.matchMedia('(min-width: 1024px)').matches ? 'desktop' : 'mobile'
}

export const aiChatService = {
  send: (message, history) =>
    api
      .post('/ai/chat/', { message, history, device: getDevice() })
      .then((r) => r.data),

  checkHealth: () => api.get('/ai/health/').then((r) => r.data),
}
