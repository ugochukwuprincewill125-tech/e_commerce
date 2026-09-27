import { Star } from 'lucide-react'

import { cn } from '../../utils/format'

/** Read-only star rating with partial fill. */
export function Stars({ value = 0, size = 'h-4 w-4', className }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, rating - i))
        return (
          <span key={i} className={cn('relative inline-block', size)}>
            <Star className={cn('absolute inset-0 text-metal-200', size)} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn('text-amber-400', size)} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        )
      })}
    </span>
  )
}

export default function Rating({ value, count, size, showValue = false, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-metal-500', className)}>
      <Stars value={value} size={size} />
      {showValue && <span className="font-semibold text-ink-900">{Number(value || 0).toFixed(1)}</span>}
      {count !== undefined && <span>({count})</span>}
    </span>
  )
}

/** Interactive star input for review forms. */
export function StarInput({ value, onChange, name = 'rating' }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          name={name}
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110"
        >
          <Star className={cn('h-7 w-7', n <= value ? 'text-amber-400' : 'text-metal-200')} fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  )
}
