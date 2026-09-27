import { cn } from '../../utils/format'

/** Flat loading placeholder. A steady pulse reads calmer than a moving sheen. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-metal-100', className)} aria-hidden />
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-7/12" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  )
}

export function ProductGridSkeleton({ count = 8, className }) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4', className)} role="status" aria-label="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ProductDetailsSkeleton() {
  return (
    <div className="container py-8" role="status" aria-label="Loading product">
      <Skeleton className="h-3.5 w-56" />
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="mt-3 flex gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-20 rounded border border-line" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading page">
      <div className="relative h-9 w-9">
        <span className="absolute inset-0 rounded-full border-2 border-metal-200" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-ink-900" />
      </div>
    </div>
  )
}
