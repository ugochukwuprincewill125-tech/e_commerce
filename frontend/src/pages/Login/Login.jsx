import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import GoogleAuthButton from '../../components/GoogleAuth/GoogleAuthButton'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage, rememberedEmail } from '../../services/api'
import { ACCOUNT_HOME, safeNext } from '../../utils/navigation'
import AuthShell from './AuthShell'

const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

export default function Login() {
  const { login, googleLogin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [googleBusy, setGoogleBusy] = useState(false)
  const next = safeNext(params.get('next'), ACCOUNT_HOME)
  const nextQuery = next !== ACCOUNT_HOME ? `?next=${encodeURIComponent(next)}` : ''
  const savedEmail = rememberedEmail.get()
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: savedEmail,
      remember: Boolean(savedEmail),
    },
  })

  const rememberSelection = (email) => {
    if (getValues('remember')) rememberedEmail.set(email)
    else rememberedEmail.clear()
  }

  const onSubmit = handleSubmit(async ({ email, password, remember }) => {
    setError('')
    setUnverifiedEmail('')
    try {
      const user = await login(email, password, remember)
      rememberSelection(email)
      toast.success(`Welcome back, ${user.first_name}!`)
      navigate(next, { replace: true })
    } catch (err) {
      const code = err.response?.data?.code
      const detail = err.response?.data?.detail
      if (code === 'email_not_verified') {
        setError(detail || 'Please verify your email address before signing in.')
        setUnverifiedEmail(email)
      } else if (err.response?.status === 401) {
        setError('Incorrect email or password.')
      } else {
        setError(errorMessage(err))
      }
    }
  })

  const onGoogleCredential = async (credential) => {
    setError('')
    setUnverifiedEmail('')
    setGoogleBusy(true)
    try {
      const user = await googleLogin(credential, getValues('remember'))
      rememberSelection(user.email)
      toast.success(`Welcome back, ${user.first_name}!`)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <>
      <Seo title="Sign in" noindex />
      <AuthShell
        title="Welcome back"
        subtitle="Sign in to track orders, manage your wishlist and check out faster."
        footer={
          <>
            New to Timeline Gadgets?{' '}
            <Link
              to={`/register${nextQuery}`}
              className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-800 hover:decoration-brand-500"
            >
              Create an account
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormAlert>{error}</FormAlert>
          {unverifiedEmail && (
            <p className="-mt-2 text-center text-[13px] text-metal-600">
              <Link
                to={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800"
              >
                Resend the verification email
              </Link>
            </p>
          )}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email', { required: 'Email is required' })}
          />
          <div>
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password', { required: 'Password is required' })}
            />
            <div className="mt-2 text-right">
              <Link
                to="/forgot-password"
                className="text-[13px] font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-metal-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line-strong accent-brand-600"
              {...register('remember')}
            />
            Remember me on this device
          </label>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting || googleBusy}>
            Sign in
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-6 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-metal-400">
                or continue with
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <GoogleAuthButton onCredential={onGoogleCredential} label="Sign in with Google" />
          </>
        )}
      </AuthShell>
    </>
  )
}
