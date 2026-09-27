import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import Breadcrumbs from '../../components/Breadcrumbs/Breadcrumbs'
import CategoryCard from '../../components/CategoryCard/CategoryCard'
import { ErrorState } from '../../components/EmptyState/EmptyState'
import { Skeleton } from '../../components/Loader/Skeleton'
import Reveal from '../../components/Motion/Reveal'
import Seo from '../../components/Seo/Seo'
import { catalogService } from '../../services/productService'
import { categoryIcon } from '../../utils/icons'

export default function Categories() {
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ['categories', 'all'], queryFn: () => catalogService.categories() })
  const roots = data.filter((c) => !c.parent)

  return (
    <>
      <Seo title="All categories" description="Browse every gadget category at Timeline Gadgets — phones, computers, audio, storage, networking, gaming and more." />
      <section className="border-b border-line bg-metal-50">
        <div className="container py-10 sm:py-14">
          <Breadcrumbs items={[{ label: 'Categories' }]} />
          <h1 className="mt-4 text-display-sm">Shop by category</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-metal-500">
            {data.length ? `${data.length} categories` : 'Categories'} of phones, computers, accessories and technology
            solutions.
          </p>
        </div>
      </section>

      <div className="container py-10 sm:py-14">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title="Unable to load categories" onRetry={refetch} />
        ) : (
          <div className="space-y-14">
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {roots.map((c, i) => (
                <Reveal key={c.slug} delay={(i % 8) * 0.03}>
                  <CategoryCard category={c} className="h-full [&>a]:h-full" />
                </Reveal>
              ))}
            </div>

            <div>
              <h2 className="text-xl font-bold">Every department</h2>
              <div className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
                {roots.map((root) => {
                  const Icon = categoryIcon(root.icon)
                  return (
                    <div key={root.slug}>
                      <Link to={`/category/${root.slug}`} className="flex items-center gap-2 font-semibold hover:text-brand-600">
                        <Icon className="h-4 w-4 text-brand-500" /> {root.name}
                      </Link>
                      {root.children.length > 0 && (
                        <ul className="mt-2 space-y-1.5 border-l border-line pl-6">
                          {root.children.map((ch) => (
                            <li key={ch.slug}>
                              <Link to={`/category/${ch.slug}`} className="text-sm text-metal-500 hover:text-ink-900">
                                {ch.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
