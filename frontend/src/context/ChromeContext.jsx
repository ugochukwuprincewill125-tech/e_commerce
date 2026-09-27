import { createContext, useContext, useMemo, useState } from 'react'

/**
 * Chrome controls that must be reachable from anywhere in the tree.
 *
 * The account shell renders no site navbar, so it cannot own the menu and
 * search triggers itself. Lifting both overlays into Layout and sharing their
 * state here means the account shell and the navbar open the same drawers
 * instead of duplicating them.
 */
const ChromeContext = createContext(null)

export function ChromeProvider({ children, onOpenMenu, onOpenSearch }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const value = useMemo(
    () => ({
      menuOpen,
      searchOpen,
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      // Exposed so Layout can drive keyboard/close behaviour if needed.
      setMenuOpen,
      setSearchOpen,
      onOpenMenu,
      onOpenSearch,
    }),
    [menuOpen, searchOpen, onOpenMenu, onOpenSearch],
  )

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useChrome() {
  const ctx = useContext(ChromeContext)
  if (!ctx) throw new Error('useChrome must be used inside ChromeProvider')
  return ctx
}
