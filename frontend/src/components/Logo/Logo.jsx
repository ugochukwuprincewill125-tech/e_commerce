import { useState } from 'react'
import { Link } from 'react-router-dom'

import useHomeLink from '../../hooks/useHomeLink'
import { cn } from '../../utils/format'

/**
 * Official Timeline Gadgets app mark.
 *
 * The master file is `public/favicon.png`. It is used unchanged (the image has
 * its own black plate), only ever sized by height with object-contain, so it is
 * never stretched, distorted or recoloured. If the file cannot load, the
 * company name is shown as plain text rather than a broken image.
 */
export const LOGO_SRC = '/favicon.png'

const SIZES = {
  sm: 'h-8',
  md: 'h-10 md:h-11',
  lg: 'h-14',
}

function TextPlaceholder({ onDark }) {
  return (
    <span className={cn('flex flex-col leading-none', onDark ? 'text-white' : 'text-ink-900')}>
      <span className="font-display text-[15px] font-bold tracking-tight sm:text-base">Timeline Gadgets</span>
      <span className={cn('mt-1 text-[10px] font-medium uppercase tracking-[0.2em]', onDark ? 'text-metal-300' : 'text-metal-500')}>
        Home of Quality Gadgets
      </span>
    </span>
  )
}

export default function Logo({ onDark = false, size = 'md', className, linked = true }) {
  // The logo is the "go to your home" affordance. The storefront landing page
  // is guest-only, so a signed-in user's home is their account dashboard.
  const to = useHomeLink()
  const signedIn = to !== '/'

  const [failed, setFailed] = useState(false)

  let content
  if (failed) {
    content = <TextPlaceholder onDark={onDark} />
  } else {
    content = (
      <span className="inline-flex items-center">
        <img
          src={LOGO_SRC}
          alt="Timeline Gadgets Limited — Home of Quality Gadgets"
          className={cn('w-auto rounded-md object-contain', SIZES[size])}
          onError={() => setFailed(true)}
          decoding="async"
        />
      </span>
    )
  }

  if (!linked) return <span className={className}>{content}</span>
  return (
    <Link to={to} className={cn('inline-flex shrink-0 items-center', className)} aria-label={signedIn ? 'Timeline Gadgets — my account' : 'Timeline Gadgets — home'}>
      {content}
    </Link>
  )
}



