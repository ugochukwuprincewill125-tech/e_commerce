import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import AccountShell from './components/Account/AccountShell'
import Layout from './components/Layout/Layout'
import { PageLoader } from './components/Loader/Skeleton'
import PageTransition from './components/Motion/PageTransition'
import ProtectedRoute, { GuestLandingRoute, GuestOnlyRoute } from './components/Routing/ProtectedRoute'
import ScrollToTop from './components/Routing/ScrollToTop'

// Code-split every page so the first load stays small.
const Home = lazy(() => import('./pages/Home/Home'))
const AdminLayout = lazy(() => import('./pages/Admin/AdminLayout'))
const AdminHome = lazy(() => import('./pages/Admin/AdminHome'))
const AdminProducts = lazy(() => import('./pages/Admin/AdminProducts'))
const AdminOrders = lazy(() => import('./pages/Admin/AdminOrders'))
const AdminRoute = lazy(() => import('./pages/Admin/AdminRoute'))
const AdminCategories = lazy(() => import('./pages/Admin/AdminTaxonomy').then((m) => ({ default: m.AdminCategories })))
const AdminBrands = lazy(() => import('./pages/Admin/AdminTaxonomy').then((m) => ({ default: m.AdminBrands })))
const AdminCustomers = lazy(() => import('./pages/Admin/AdminPeople').then((m) => ({ default: m.AdminCustomers })))
const AdminReviews = lazy(() => import('./pages/Admin/AdminPeople').then((m) => ({ default: m.AdminReviews })))
const AdminMessages = lazy(() => import('./pages/Admin/AdminPeople').then((m) => ({ default: m.AdminMessages })))
const AdminCoupons = lazy(() => import('./pages/Admin/AdminCoupons'))
const AdminReports = lazy(() => import('./pages/Admin/AdminReports'))
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
const HomeFeed = lazy(() => import('./pages/Dashboard/HomeFeed'))
const CategoryDirectory = lazy(() => import('./pages/Dashboard/CategoryDirectory'))
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
            <Route path="/shop" element={<Page><AccountShell><Shop /></AccountShell></Page>} />
            <Route path="/category/:categorySlug" element={<Page><AccountShell><Shop /></AccountShell></Page>} />
            <Route path="/brands" element={<Page><AccountShell><Brands /></AccountShell></Page>} />
            <Route path="/brands/:brandSlug" element={<Page><AccountShell><Shop /></AccountShell></Page>} />
            <Route path="/categories" element={<Page><AccountShell><Categories /></AccountShell></Page>} />
            <Route path="/products/:slug" element={<Page><AccountShell><ProductDetails /></AccountShell></Page>} />
            <Route path="/cart" element={<Page><AccountShell><Cart /></AccountShell></Page>} />
            <Route path="/checkout" element={<ProtectedRoute><Page><AccountShell><Checkout /></AccountShell></Page></ProtectedRoute>} />
            <Route path="/payment/callback" element={<ProtectedRoute><Page><AccountShell><PaymentCallback /></AccountShell></Page></ProtectedRoute>} />
            <Route path="/login" element={<GuestOnlyRoute><Page><Login /></Page></GuestOnlyRoute>} />
            <Route path="/register" element={<GuestOnlyRoute><Page><Register /></Page></GuestOnlyRoute>} />
            <Route path="/forgot-password" element={<Page><ForgotPassword /></Page>} />
            <Route path="/reset-password/:uid/:token" element={<Page><ResetPassword /></Page>} />
            <Route path="/verify-email/:uid/:token" element={<Page><VerifyEmail /></Page>} />
            <Route path="/track-order" element={<Page><AccountShell><TrackOrder /></AccountShell></Page>} />
            <Route path="/wishlist" element={<Navigate to="/account/wishlist" replace />} />
            <Route path="/account" element={<ProtectedRoute><Page><Dashboard /></Page></ProtectedRoute>}>
              <Route index element={<Overview />} />
              <Route path="home" element={<HomeFeed />} />
              <Route path="categories" element={<CategoryDirectory />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:orderNumber" element={<OrderDetails />} />
              <Route path="wishlist" element={<Wishlist />} />
              <Route path="profile" element={<Profile />} />
              <Route path="addresses" element={<Addresses />} />
            </Route>
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<AdminHome />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/products" element={<AdminProducts />} />
              <Route path="/admin/categories" element={<AdminCategories />} />
              <Route path="/admin/brands" element={<AdminBrands />} />
              <Route path="/admin/customers" element={<AdminCustomers />} />
              <Route path="/admin/reviews" element={<AdminReviews />} />
              <Route path="/admin/messages" element={<AdminMessages />} />
              <Route path="/admin/coupons" element={<AdminCoupons />} />
              <Route path="/admin/reports" element={<AdminReports />} />
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
