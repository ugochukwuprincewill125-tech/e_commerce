import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import useHomeLink from '../../hooks/useHomeLink'
import { cn } from '../../utils/format'

export default function Breadcrumbs({ items, className, dark = false }) {
  const home = useHomeLink()
  const rootLabel = home === '/account' ? 'My Account' : 'Home'
  return (
    <nav aria-label="Breadcrumb" className={cn('text-[13px]', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to={home} className={cn('transition-colors', dark ? 'text-metal-400 hover:text-white' : 'text-metal-500 hover:text-ink-900')}>
            {rootLabel}
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={item.label + i} className="flex items-center gap-1.5">
            <ChevronRight className={cn('h-3.5 w-3.5', dark ? 'text-metal-600' : 'text-metal-300')} aria-hidden />
            {item.to && i < items.length - 1 ? (
              <Link to={item.to} className={cn('transition-colors', dark ? 'text-metal-400 hover:text-white' : 'text-metal-500 hover:text-ink-900')}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className={cn('line-clamp-1 font-medium', dark ? 'text-white' : 'text-ink-900')}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
