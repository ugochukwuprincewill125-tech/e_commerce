import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { cartSession, errorMessage } from '../services/api'
import { cartService } from '../services/cartService'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

const CartContext = createContext(null)

/**
 * The cart lives on the server (guests get an anonymous cart id stored in the
 * browser). This context only mirrors the server state — every change goes
 * through the API, which validates stock and prices.
 */
export function CartProvider({ children }) {
  const { user, initialising } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pending, setPending] = useState(null) // id of the product/item being updated
  const [bump, setBump] = useState(0) // triggers the badge animation
  const previousUser = useRef(user?.id ?? null)

  const userKey = user?.id ?? 'guest'
  const key = useMemo(() => ['cart', userKey], [userKey])

  const cartQuery = useQuery({
    queryKey: key,
    queryFn: cartService.get,
    enabled: !initialising,
    staleTime: 30_000,
  })

  // Remember the guest cart id the server hands us.
  useEffect(() => {
    if (!user && cartQuery.data?.session_id) cartSession.set(cartQuery.data.session_id)
  }, [cartQuery.data, user])

  // Merge guest cart on sign-in; start fresh on sign-out.
  useEffect(() => {
    const prev = previousUser.current
    const current = user?.id ?? null
    previousUser.current = current
    if (initialising || prev === current) return
    if (current && !prev) {
      const session = cartSession.get()
      const done = () => {
        cartSession.clear()
        queryClient.invalidateQueries({ queryKey: ['cart'] })
      }
      if (session) cartService.merge(session).then((cart) => queryClient.setQueryData(['cart', current], cart)).finally(done)
      else done()
    } else if (!current && prev) {
      cartSession.clear()
      queryClient.removeQueries({ queryKey: ['cart'] })
    }
  }, [user, initialising, queryClient])

  const setCart = useCallback((cart) => queryClient.setQueryData(key, cart), [queryClient, key])

  const addItem = useCallback(
    async (product, quantity = 1, variant = null, { silent = false, openDrawer = false } = {}) => {
      setPending(product.id)
      try {
        const cart = await cartService.add(product.id, quantity, variant?.id ?? null)
        setCart(cart)
        setBump((b) => b + 1)
        if (!silent) {
          toast.toast({
            type: 'cart',
            title: `${product.name}${variant ? ` (${variant.value})` : ''} added to your cart.`,
            image: product.image || product.images?.[0]?.image,
            action: { label: 'View cart', to: '/cart' },
          })
        }
        if (openDrawer) setDrawerOpen(true)
        return cart
      } catch (error) {
        toast.error('Couldn’t add to cart', errorMessage(error))
        throw error
      } finally {
        setPending(null)
      }
    },
    [setCart, toast],
  )

  const updateItem = useCallback(
    async (itemId, quantity) => {
      setPending(itemId)
      try {
        setCart(await cartService.update(itemId, quantity))
      } catch (error) {
        toast.error('Couldn’t update quantity', errorMessage(error))
      } finally {
        setPending(null)
      }
    },
    [setCart, toast],
  )

  const removeItem = useCallback(
    async (itemId) => {
      setPending(itemId)
      try {
        const cart = await cartService.remove(itemId)
        setCart(cart)
        toast.info(cart.detail || 'Item removed from your cart.')
      } catch (error) {
        toast.error('Couldn’t remove item', errorMessage(error))
      } finally {
        setPending(null)
      }
    },
    [setCart, toast],
  )

  const clearCart = useCallback(async () => {
    setCart(await cartService.clear())
  }, [setCart])

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['cart'] }), [queryClient])

  const cart = cartQuery.data
  const value = useMemo(
    () => ({
      cart,
      items: cart?.items || [],
      itemCount: cart?.item_count || 0,
      subtotal: cart?.subtotal || '0',
      hasIssues: cart?.has_issues || false,
      isLoading: cartQuery.isLoading,
      isError: cartQuery.isError,
      pending,
      bump,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      addItem,
      updateItem,
      removeItem,
      clearCart,
      refresh,
    }),
    [cart, cartQuery.isLoading, cartQuery.isError, pending, bump, drawerOpen, addItem, updateItem, removeItem, clearCart, refresh],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
