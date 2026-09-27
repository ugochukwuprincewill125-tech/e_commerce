import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import EmptyState from '../../components/EmptyState/EmptyState'
import { FormAlert } from '../../components/Form/Field'
import { Skeleton } from '../../components/Loader/Skeleton'
import Rating, { StarInput, Stars } from '../../components/Rating/Rating'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage } from '../../services/api'
import { reviewService } from '../../services/productService'
import { formatDate } from '../../utils/format'

function ReviewForm({ product, onDone }) {
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const submit = async (e) => {
    e.preventDefault()
    if (!rating) return setError('Please choose a star rating.')
    if (comment.trim().length < 10) return setError('Please write at least 10 characters.')
    setLoading(true)
    setError('')
    try {
      const res = await reviewService.create({ product: product.id, rating, title, comment })
      toast.success(res.detail)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
    return undefined
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-metal-50/50 p-5 sm:p-6">
      <h3 className="font-sans text-base font-semibold">Write a review</h3>
      <div className="mt-4 space-y-4">
        <StarInput value={rating} onChange={setRating} />
        <div>
          <label htmlFor="review-title" className="label">
            Title (optional)
          </label>
          <input id="review-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up in a few words" />
        </div>
        <div>
          <label htmlFor="review-comment" className="label">
            Your review
          </label>
          <textarea id="review-comment" className="input min-h-[110px]" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder="What did you like? How are you using it?" />
        </div>
        <FormAlert>{error}</FormAlert>
        <Button type="submit" loading={loading}>
          Submit review
        </Button>
      </div>
    </form>
  )
}

export default function Reviews({ product }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const reviews = useQuery({
    queryKey: ['reviews', product.slug, page],
    queryFn: () => reviewService.list({ product: product.slug, page, page_size: 5 }),
    placeholderData: (prev) => prev,
  })
  const eligibility = useQuery({
    queryKey: ['review-eligibility', product.slug, user?.id],
    queryFn: () => reviewService.eligibility(product.slug),
    enabled: Boolean(user),
  })

  const breakdown = product.rating_breakdown || {}
  const total = product.review_count || 0

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews', product.slug] })
    queryClient.invalidateQueries({ queryKey: ['review-eligibility', product.slug] })
    queryClient.invalidateQueries({ queryKey: ['product', product.slug] })
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
      <div>
        <div className="rounded-lg border border-line p-6">
          <p className="text-5xl font-bold">{Number(product.rating || 0).toFixed(1)}</p>
          <Stars value={product.rating} size="h-5 w-5" className="mt-2" />
          <p className="mt-2 text-sm text-metal-500">Based on {total} review{total === 1 ? '' : 's'}</p>
          <div className="mt-5 space-y-2">
            {['5', '4', '3', '2', '1'].map((star) => {
              const n = breakdown[star] || 0
              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <span className="w-3 font-semibold">{star}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-metal-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: total ? `${(n / total) * 100}%` : 0 }} />
                  </div>
                  <span className="w-6 text-right text-metal-400">{n}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="mt-4">
          {!user ? (
            <p className="text-sm text-metal-500">
              <Link to={`/login?next=/products/${product.slug}`} className="font-semibold text-brand-600">
                Sign in
              </Link>{' '}
              to review products you’ve purchased.
            </p>
          ) : eligibility.data && !eligibility.data.can_review ? (
            <p className="text-sm text-metal-500">{eligibility.data.reason}</p>
          ) : null}
        </div>
      </div>

      <div>
        {eligibility.data?.can_review && (
          <div className="mb-8">
            <ReviewForm product={product} onDone={refresh} />
          </div>
        )}
        {reviews.isLoading ? (
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : !reviews.data?.results?.length ? (
          <EmptyState icon={MessageSquare} title="No reviews yet" message="Customers who buy this product can share their experience here." className="py-8" />
        ) : (
          <>
            <ul className="divide-y divide-metal-100">
              {reviews.data.results.map((r) => (
                <li key={r.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-white">{r.customer_name[0]}</span>
                    <div>
                      <p className="text-sm font-semibold">{r.customer_name}</p>
                      <p className="text-xs text-metal-400">{formatDate(r.created_at)}</p>
                    </div>
                    {r.is_verified_purchase && (
                      <span className="chip ml-auto bg-emerald-50 text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> Verified purchase
                      </span>
                    )}
                  </div>
                  <Rating value={r.rating} className="mt-3" />
                  {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                  <p className="mt-1 text-sm leading-relaxed text-metal-600">{r.comment}</p>
                </li>
              ))}
            </ul>
            {reviews.data.total_pages > 1 && (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Newer
                </Button>
                <Button variant="outline" size="sm" disabled={page >= reviews.data.total_pages} onClick={() => setPage((p) => p + 1)}>
                  Older
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
