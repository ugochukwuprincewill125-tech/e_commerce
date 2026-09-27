import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../../utils/format'

function pages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, current, current - 1, current + 1])
  const list = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  list.forEach((p, i) => {
    if (i && p - list[i - 1] > 1) out.push('…' + p)
    out.push(p)
  })
  return out
}

export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null
  const btn =
    'flex h-9 min-w-9 items-center justify-center rounded border px-3 text-[13px] font-semibold transition-colors'
  return (
    <nav className="mt-12 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        className={cn(btn, 'border-line-strong bg-white text-ink-900 hover:border-ink-900 disabled:opacity-40')}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages(page, totalPages).map((p) =>
        typeof p === 'string' ? (
          <span key={p} className="px-1 text-metal-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(btn, p === page ? 'border-ink-900 bg-ink-900 text-white' : 'border-line-strong bg-white text-ink-900 hover:border-ink-900')}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={cn(btn, 'border-line-strong bg-white text-ink-900 hover:border-ink-900 disabled:opacity-40')}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  )
}
