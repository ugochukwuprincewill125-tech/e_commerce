import { motion } from 'framer-motion'
import { LoaderCircle } from 'lucide-react'
import { forwardRef } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '../../utils/format'

/**
 * Variant map. Fill weight carries hierarchy: ink (primary) > brand (accent)
 * > outline > ghost. `white` and `inverse` exist for placement on dark
 * surfaces; neither uses translucency or blur.
 */
const VARIANTS = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  white: 'btn bg-white text-ink-900 hover:bg-metal-100',
  inverse: 'btn-inverse',
  // Retained so existing call sites keep working; renders as a solid outline.
  glass: 'btn-inverse',
  danger: 'btn bg-danger text-white hover:bg-red-700',
}
const SIZES = {
  sm: 'px-3 py-1.5 text-[13px] rounded',
  md: '',
  lg: 'px-5 py-3 text-[15px]',
}

const MotionLink = motion.create ? motion.create(Link) : motion(Link)

/** Button with restrained hover/tap motion and a built-in loading state. */
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, to, href, className, children, disabled, icon: Icon, iconRight: IconRight, ...props },
  ref,
) {
  const classes = cn(VARIANTS[variant], SIZES[size], className)
  const motionProps = { whileTap: disabled || loading ? undefined : { scale: 0.985 } }
  const inner = (
    <>
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : Icon && <Icon className="h-4 w-4" aria-hidden />}
      <span>{children}</span>
      {IconRight && !loading && <IconRight className="h-4 w-4" aria-hidden />}
    </>
  )
  if (to) {
    return (
      <MotionLink ref={ref} to={to} className={classes} {...motionProps} {...props}>
        {inner}
      </MotionLink>
    )
  }
  if (href) {
    return (
      <motion.a ref={ref} href={href} className={classes} {...motionProps} {...props}>
        {inner}
      </motion.a>
    )
  }
  return (
    <motion.button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading} {...motionProps} type="button" {...props}>
      {inner}
    </motion.button>
  )
})

export default Button
