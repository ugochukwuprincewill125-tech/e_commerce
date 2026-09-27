import { Minus, Plus } from 'lucide-react'

import { cn } from '../../utils/format'

/** Square, dense stepper — matches the flat control language used across the app. */
export default function QuantitySelector({ value, onChange, min = 1, max = 99, disabled, size = 'md', label = 'Quantity' }) {
  const h = size === 'sm' ? 'h-8' : 'h-11'
  const w = size === 'sm' ? 'w-8' : 'w-10'
  return (
    <div className={cn('inline-flex items-center rounded border border-line-strong bg-white', h)} role="group" aria-label={label}>
      <button
        type="button"
        className={cn('flex h-full items-center justify-center rounded-l text-ink-800 transition-colors hover:bg-metal-100 disabled:opacity-30', w)}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <span className={cn('min-w-8 text-center text-[13px] font-semibold tabular-nums text-ink-900', size === 'sm' ? 'px-1' : 'px-1.5')} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn('flex h-full items-center justify-center rounded-r text-ink-800 transition-colors hover:bg-metal-100 disabled:opacity-30', w)}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}
