import { cn, formatNaira } from '../../utils/format'

/** Renders product options (storage, colour, RAM…) as selectable pills. */
export default function VariantPicker({ variants, value, onChange }) {
  if (!variants?.length) return null
  const type = variants[0].variant_type_display
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-semibold text-ink-900">
        {type}: <span className="font-normal text-metal-500">{value?.value || 'Select an option'}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const active = value?.id === v.id
          const disabled = !v.in_stock
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v)}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                'relative flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition',
                active ? 'border-ink-900 bg-ink-900 text-white' : 'border-metal-200 bg-white text-ink-900 hover:border-ink-900',
                disabled && 'cursor-not-allowed opacity-40 line-through',
              )}
            >
              {v.color_hex && <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ backgroundColor: v.color_hex }} aria-hidden />}
              <span>{v.value}</span>
              {Number(v.price_adjustment) !== 0 && (
                <span className={cn('text-xs', active ? 'text-metal-300' : 'text-metal-500')}>
                  {Number(v.price_adjustment) > 0 ? '+' : '−'}
                  {formatNaira(Math.abs(Number(v.price_adjustment)))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
