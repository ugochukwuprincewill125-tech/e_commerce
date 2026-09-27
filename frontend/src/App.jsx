import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import Layout from './components/Layout/Layout'
import { PageLoader } from './components/Loader/Skeleton'
import PageTransition from './components/Motion/PageTransition'
import ProtectedRoute, { GuestLandingRoute, GuestOnlyRoute } from './components/Routing/ProtectedRoute'
import ScrollToTop from './components/Routing/ScrollToTop'

// Code-split every page so the first load stays small.
const Home = lazy(() => import('./pages/Home/Home'))
const Shop = lazy(() => import('./pages/Shop/Shop'))
const ProductDetails = lazy(() => import('./pages/ProductDetails/ProductDetails'))
const Categories = lazy(() => import('./pages/Categories/Categories'))
const Brands = lazy(() => import('./pages/Brands/Brands'))
const Cart = lazy(() => import('./pages/Cart/Cart'))
const Checkout = lazy(() => import('./pages/Checkout/Checkout'))
const PaymentCallback = lazy(() => import('./pages/Checkout/PaymentCallback'))
const Login = lazy(() => import('./pages/Login/Login'))
const Register = lazy(() => import('./pages/Register/Register'))
const ForgotPassword = lazy(() => import('./pages/Login/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/Login/ResetPassword'))
const VerifyEmail = lazy(() => import('./pages/Login/VerifyEmail'))
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const Overview = lazy(() => import('./pages/Dashboard/Overview'))
const Orders = lazy(() => import('./pages/Orders/Orders'))
const OrderDetails = lazy(() => import('./pages/Orders/OrderDetails'))
const Wishlist = lazy(() => import('./pages/Wishlist/Wishlist'))
const Profile = lazy(() => import('./pages/Dashboard/Profile'))
const Addresses = lazy(() => import('./pages/Dashboard/Addresses'))
const TrackOrder = lazy(() => import('./pages/Orders/TrackOrder'))
const About = lazy(() => import('./pages/About/About'))
const Contact = lazy(() => import('./pages/Contact/Contact'))
const InfoPage = lazy(() => import('./pages/Info/InfoPage'))
const NotFound = lazy(() => import('./pages/NotFound/NotFound'))

function Page({ children }) {
  return <PageTransition>{children}</PageTransition>
}

export default function App() {
  const location = useLocation()
  // Animate between top-level sections; nested dashboard routes share one key.
  const key = location.pathname.startsWith('/account') ? '/account' : location.pathname

  return (
    <Layout>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={key}>
            <Route path="/" element={<GuestLandingRoute><Page><Home /></Page></GuestLandingRoute>} />
            <Route path="/shop" element={<Page><Shop /></Page>} />
            <Route path="/category/:categorySlug" element={<Page><Shop /></Page>} />
            <Route path="/brands" element={<Page><Brands /></Page>} />
            <Route path="/brands/:brandSlug" element={<Page><Shop /></Page>} />
            <Route path="/categories" element={<Page><Categories /></Page>} />
            <Route path="/products/:slug" element={<Page><ProductDetails /></Page>} />
            <Route path="/cart" element={<Page><Cart /></Page>} />
            <Route path="/checkout" element={<ProtectedRoute><Page><Checkout /></Page></ProtectedRoute>} />
            <Route path="/payment/callback" element={<ProtectedRoute><Page><PaymentCallback /></Page></ProtectedRoute>} />
            <Route path="/login" element={<GuestOnlyRoute><Page><Login /></Page></GuestOnlyRoute>} />
            <Route path="/register" element={<GuestOnlyRoute><Page><Register /></Page></GuestOnlyRoute>} />
            <Route path="/forgot-password" element={<Page><ForgotPassword /></Page>} />
            <Route path="/reset-password/:uid/:token" element={<Page><ResetPassword /></Page>} />
            <Route path="/verify-email/:uid/:token" element={<Page><VerifyEmail /></Page>} />
            <Route path="/track-order" element={<Page><TrackOrder /></Page>} />
            <Route path="/wishlist" element={<Navigate to="/account/wishlist" replace />} />
            <Route path="/account" element={<ProtectedRoute><Page><Dashboard /></Page></ProtectedRoute>}>
              <Route index element={<Overview />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:orderNumber" element={<OrderDetails />} />
              <Route path="wishlist" element={<Wishlist />} />
              <Route path="profile" element={<Profile />} />
              <Route path="addresses" element={<Addresses />} />
            </Route>
            <Route path="/about" element={<Page><About /></Page>} />
            <Route path="/contact" element={<Page><Contact /></Page>} />
            <Route path="/shipping" element={<Page><InfoPage page="shipping" /></Page>} />
            <Route path="/returns" element={<Page><InfoPage page="returns" /></Page>} />
            <Route path="/faqs" element={<Page><InfoPage page="faqs" /></Page>} />
            <Route path="*" element={<Page><NotFound /></Page>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </Layout>
  )
}
