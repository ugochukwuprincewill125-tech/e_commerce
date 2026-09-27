import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useId, useState } from 'react'

import { cn } from '../../utils/format'

/** Labelled input wired for react-hook-form (`{...register('name')}`) with accessible errors. */
export const Field = forwardRef(function Field({ label, error, hint, className, type = 'text', as = 'input', children, ...props }, ref) {
  const id = useId()
  const [show, setShow] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const isPassword = type === 'password'
  const common = {
    id,
    ref,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    className: cn('input', error && 'input-error', isPassword && 'pr-11', as === 'textarea' && 'min-h-[120px] resize-y'),
    ...props,
  }
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        {as === 'textarea' ? (
          <textarea {...common} />
        ) : as === 'select' ? (
          <select {...common}>{children}</select>
        ) : (
          <input type={isPassword && show ? 'text' : type} {...common} />
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-metal-400 transition-colors hover:text-ink-900"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="hint">
            {hint}
          </p>
        )
      )}
    </div>
  )
})

export function FormAlert({ children, tone = 'error' }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className={cn(
        'rounded border px-4 py-3 text-sm',
        tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
      )}
    >
      {children}
    </div>
  )
}
