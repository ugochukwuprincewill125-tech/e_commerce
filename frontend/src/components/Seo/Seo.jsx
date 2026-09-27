import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

const SITE = 'Timeline Gadgets'
const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')
const DEFAULT_DESCRIPTION =
  'Timeline Global Systems Limited — Home of Quality Gadgets. Phones, laptops, audio, storage, networking and accessories at competitive prices from Computer Village, Ikeja, Lagos.'

export default function Seo({ title, description = DEFAULT_DESCRIPTION, image, type = 'website', jsonLd, noindex = false }) {
  const { pathname } = useLocation()
  const fullTitle = title ? `${title} | ${SITE}` : 'Timeline Global Systems — Home of Quality Gadgets'
  const url = SITE_URL ? `${SITE_URL}${pathname}` : undefined
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}
      {noindex && <meta name="robots" content="noindex" />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  )
}
