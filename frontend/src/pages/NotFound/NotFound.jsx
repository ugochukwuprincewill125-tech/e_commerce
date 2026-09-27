import { ArrowLeft, Search } from 'lucide-react'

import Button from '../../components/Button/Button'
import Seo from '../../components/Seo/Seo'
import useHomeLink from '../../hooks/useHomeLink'

export default function NotFound() {
  const home = useHomeLink()
  const signedIn = home !== '/'
  return (
    <>
      <Seo title="Page not found" noindex />
      <div className="container flex min-h-[65vh] flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-[5rem] font-semibold leading-none tracking-tightest text-metal-200 sm:text-[7rem]">
          404
        </p>
        <h1 className="mt-6 text-2xl font-semibold sm:text-3xl">Page not found</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-metal-500">
          The page you are looking for does not exist, or it may have been moved. Please check the address or continue
          browsing our catalogue.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to={home} icon={ArrowLeft}>
            {signedIn ? 'Back to my account' : 'Back to home'}
          </Button>
          <Button to="/shop" variant="outline" icon={Search}>
            Browse products
          </Button>
        </div>
      </div>
    </>
  )
}
