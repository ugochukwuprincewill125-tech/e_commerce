import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import Button from '../Button/Button'
import { cn } from '../../utils/format'

export default function EmptyState({ icon: Icon, title, message, action, secondary, className, tone = 'default' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('mx-auto flex max-w-measure-sm flex-col items-center px-4 py-16 text-center', className)}
    >
      {Icon && (
        <div
          className={cn(
            'mb-6 flex h-14 w-14 items-center justify-center rounded border',
            tone === 'error' ? 'border-red-200 bg-red-50 text-danger' : 'border-line bg-metal-50 text-ink-800',
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        </div>
      )}
      <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
      {message && <p className="mt-2 max-w-measure-sm text-sm leading-relaxed text-metal-500">{message}</p>}
      {(action || secondary) && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <Button to={action.to} onClick={action.onClick} variant={action.variant || 'primary'} icon={action.icon}>
              {action.label}
            </Button>
          )}
          {secondary && (
            <Button to={secondary.to} onClick={secondary.onClick} variant="outline">
              {secondary.label}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  )
}

export function ErrorState({ title = 'Something went wrong', message = 'We could not load this right now. Please try again.', onRetry, className }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      tone="error"
      title={title}
      message={message}
      className={className}
      action={onRetry ? { label: 'Try again', onClick: onRetry, icon: RefreshCw } : { label: 'Back to home', to: '/' }}
    />
  )
}
