import { useQuery } from '@tanstack/react-query'

import { useCart } from '../context/CartContext'
import { cartService } from '../services/cartService'

/** Server-calculated totals for the current cart. */
export default function useQuote({ coupon_code = '', state = '', delivery_method = 'delivery' } = {}) {
  const { cart } = useCart()
  // Re-quote whenever the cart contents change.
  const signature = cart ? `${cart.updated_at}-${cart.item_count}-${cart.subtotal}` : 'none'
  return useQuery({
    queryKey: ['quote', signature, coupon_code, state, delivery_method],
    queryFn: () => cartService.quote({ coupon_code, state, delivery_method }),
    enabled: Boolean(cart),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  })
}
