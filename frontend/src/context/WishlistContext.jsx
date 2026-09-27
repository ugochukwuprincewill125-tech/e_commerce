import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { errorMessage } from '../services/api'
import { wishlistService } from '../services/cartService'
import { currentTarget, withNext } from '../utils/navigation'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(null)

  const userId = user?.id
  const key = useMemo(() => ['wishlist', userId], [userId])
  const query = useQuery({ queryKey: key, queryFn: wishlistService.get, enabled: Boolean(user), staleTime: 60_000 })

  const ids = useMemo(() => new Set(query.data?.product_ids || []), [query.data])

  const requireLogin = useCallback(() => {
    toast.info('Sign in to save items', 'Create a free account to keep a wishlist across devices.')
    navigate(withNext(currentTarget(location)))
  }, [navigate, location, toast])

  const toggle = useCallback(
    async (product) => {
      if (!user) return requireLogin()
      setPending(product.id)
      try {
        const saved = ids.has(product.id)
        const data = saved ? await wishlistService.remove(product.id) : await wishlistService.add(product.id)
        queryClient.setQueryData(key, data)
        toast.toast({ type: saved ? 'info' : 'success', title: data.detail })
      } catch (error) {
        toast.error('Wishlist not updated', errorMessage(error))
      } finally {
        setPending(null)
      }
      return undefined
    },
    [user, ids, queryClient, key, toast, requireLogin],
  )

  const moveToCart = useCallback(
    async (product) => {
      setPending(product.id)
      try {
        const data = await wishlistService.moveToCart(product.id)
        queryClient.setQueryData(key, data)
        queryClient.invalidateQueries({ queryKey: ['cart'] })
        toast.toast({ type: 'cart', title: data.detail, image: product.image, action: { label: 'View cart', to: '/cart' } })
      } catch (error) {
        toast.error('Couldn’t move to cart', errorMessage(error))
      } finally {
        setPending(null)
      }
    },
    [queryClient, key, toast],
  )

  const value = useMemo(
    () => ({
      items: query.data?.items || [],
      count: query.data?.count || 0,
      isLoading: query.isLoading && Boolean(user),
      isError: query.isError,
      has: (id) => ids.has(id),
      pending,
      toggle,
      moveToCart,
    }),
    [query.data, query.isLoading, query.isError, user, ids, pending, toggle, moveToCart],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider')
  return ctx
}
