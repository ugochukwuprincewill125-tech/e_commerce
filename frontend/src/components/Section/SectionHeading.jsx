import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import Reveal from '../Motion/Reveal'
import { cn } from '../../utils/format'

/**
 * Section header. A hairline rule separates the heading block from the content
 * below it, which is what gives the page its editorial rhythm.
 */
export default function SectionHeading({ eyebrow, title, subtitle, link, align = 'left', className, dark = false }) {
  return (
    <Reveal
      className={cn(
        'mb-8 flex flex-col gap-4 border-b pb-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:pb-7',
        dark ? 'border-white/10' : 'border-line',
        align === 'center' && 'items-center text-center sm:flex-col sm:items-center',
        className,
      )}
    >
      <div className={cn('max-w-measure', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <p className={cn('eyebrow mb-3', dark && 'text-metal-400 [&::before]:bg-brand-400')}>{eyebrow}</p>
        )}
        <h2
          className={cn(
            'text-section-title sm:text-[2.125rem]',
            dark ? 'text-white' : 'text-ink-900',
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className={cn('mt-3 text-[15px] leading-relaxed', dark ? 'text-metal-400' : 'text-metal-500')}>{subtitle}</p>
        )}
      </div>
      {link && (
        <Link
          to={link.to}
          className={cn(
            'group inline-flex shrink-0 items-center gap-1.5 pb-1 text-[13px] font-semibold',
            dark ? 'text-white' : 'text-ink-900',
          )}
        >
          {link.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      )}
    </Reveal>
  )
}
