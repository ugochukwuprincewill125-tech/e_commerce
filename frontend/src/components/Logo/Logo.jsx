import { useState } from 'react'
import { Link } from 'react-router-dom'

import useHomeLink from '../../hooks/useHomeLink'
import { cn } from '../../utils/format'

/**
 * Official Timeline Global Systems logo.
 *
 * Put the supplied logo files in /public/brand (see README.txt there):
 *   timeline-logo.png        – standard logo for light backgrounds
 *   timeline-logo-white.png  – optional version for dark backgrounds
 *
 * The image is only ever sized by height with object-contain, so it is never
 * stretched, distorted or recoloured. Until the file exists, the company name
 * is shown as plain text (a placeholder, not a logo).
 */
export const LOGO_SRC = '/brand/timeline-logo.png'
export const LOGO_ON_DARK_SRC = '/brand/timeline-logo-white.png'

const SIZES = {
  sm: 'h-8',
  md: 'h-10 md:h-11',
  lg: 'h-14',
}

function TextPlaceholder({ onDark }) {
  return (
    <span className={cn('flex flex-col leading-none', onDark ? 'text-white' : 'text-ink-900')}>
      <span className="font-display text-[15px] font-bold tracking-tight sm:text-base">Timeline Global Systems</span>
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

  // 0 = preferred file, 1 = fallback file (standard logo on a light plate), 2 = text placeholder
  const [stage, setStage] = useState(0)
  const src = onDark && stage === 0 ? LOGO_ON_DARK_SRC : LOGO_SRC
  const usePlate = onDark && stage === 1

  let content
  if (stage === 2) {
    content = <TextPlaceholder onDark={onDark} />
  } else {
    content = (
      <span className={cn('inline-flex items-center', usePlate && 'rounded-xl bg-white px-3 py-1.5')}>
        <img
          src={src}
          alt="Timeline Global Systems Limited — Home of Quality Gadgets"
          className={cn('w-auto max-w-[220px] object-contain', SIZES[size])}
          onError={() => setStage((s) => (onDark ? s + 1 : 2))}
          decoding="async"
        />
      </span>
    )
  }

  if (!linked) return <span className={className}>{content}</span>
  return (
    <Link to={to} className={cn('inline-flex shrink-0 items-center', className)} aria-label={signedIn ? 'Timeline Global Systems — my account' : 'Timeline Global Systems — home'}>
      {content}
    </Link>
  )
}
