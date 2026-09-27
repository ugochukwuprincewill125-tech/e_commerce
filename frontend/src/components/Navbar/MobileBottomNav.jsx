import { Heart, LayoutGrid, Package, Search, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { useWishlist } from '../../context/WishlistContext'
import { cn } from '../../utils/format'

/**
 * Mobile tab bar. The landing page is guest-only, so a signed-in member gets
 * "Orders" in the first slot instead of a "Home" link that would redirect.
 */
export default function MobileBottomNav({ onOpenSearch }) {
  const { user } = useAuth()
  const { count } = useWishlist()

  const item = ({ isActive }) =>
    cn(
      'flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-semibold transition-colors',
      isActive ? 'text-brand-700' : 'text-metal-500',
    )

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-safe sm:hidden" aria-label="Quick navigation">
      <div className="flex">
        {user ? (
          <NavLink to="/account" end className={item}>
            <User className="h-5 w-5" strokeWidth={1.75} /> Account
          </NavLink>
        ) : (
          <NavLink to="/" end className={item}>
            <User className="h-5 w-5" strokeWidth={1.75} /> Home
          </NavLink>
        )}

        <NavLink to="/shop" className={item}>
          <LayoutGrid className="h-5 w-5" strokeWidth={1.75} /> Shop
        </NavLink>

        <button type="button" onClick={onOpenSearch} className={item({ isActive: false })}>
          <Search className="h-5 w-5" strokeWidth={1.75} /> Search
        </button>

        {user && (
          <NavLink to="/account/orders" className={item}>
            <Package className="h-5 w-5" strokeWidth={1.75} /> Orders
          </NavLink>
        )}

        <NavLink to="/account/wishlist" className={item}>
          <span className="relative">
            <Heart className="h-5 w-5" strokeWidth={1.75} />
            {count > 0 && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-brand-600" />}
          </span>
          Wishlist
        </NavLink>
      </div>
    </nav>
  )
}
