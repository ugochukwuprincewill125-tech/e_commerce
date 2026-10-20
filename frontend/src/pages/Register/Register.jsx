import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import GoogleAuthButton from '../../components/GoogleAuth/GoogleAuthButton'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage, fieldErrors } from '../../services/api'
import { ACCOUNT_HOME, safeNext } from '../../utils/navigation'
import AuthShell from '../Login/AuthShell'

const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

export default function Register() {
  const { register: signUp, googleLogin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const [googleBusy, setGoogleBusy] = useState(false)
  const next = safeNext(params.get('next'), ACCOUNT_HOME)
  const nextQuery = next !== ACCOUNT_HOME ? `?next=${encodeURIComponent(next)}` : ''
  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched' })

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    try {
      const data = await signUp(values)
      toast.success('Account created — check your inbox', `${data.detail} If you don't see it, check your spam folder.`)
      const query = new URLSearchParams({ email: values.email })
      if (next && next !== ACCOUNT_HOME) query.set('next', next)
      navigate(`/verify-email?${query.toString()}`, { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      setError(Object.keys(fe).length ? '' : errorMessage(err))
    }
  })

  const onGoogleCredential = async (credential) => {
    setError('')
    setGoogleBusy(true)
    try {
      const user = await googleLogin(credential, false)
      toast.success(`Welcome, ${user.first_name}!`, 'Your Google email is already verified.')
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <>
      <Seo title="Create account" noindex />
      <AuthShell
        title="Create your account"
        subtitle="It only takes a minute."
        footer={
          <>
            Already have an account?{' '}
            <Link
              to={`/login${nextQuery}`}
              className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-800 hover:decoration-brand-500"
            >
              Sign in
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormAlert>{error}</FormAlert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              autoComplete="given-name"
              error={errors.first_name?.message}
              {...register('first_name', { required: 'First name is required' })}
            />
            <Field
              label="Last name"
              autoComplete="family-name"
              error={errors.last_name?.message}
              {...register('last_name', { required: 'Last name is required' })}
            />
          </div>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' },
            })}
          />
          <Field
            label="Phone"
            type="tel"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register('phone', {
              required: 'Phone number is required',
              pattern: { value: /^\+?[0-9\s\-()]{7,20}$/, message: 'Enter a valid phone number' },
            })}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters. Avoid common or all-number passwords."
            error={errors.password?.message}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Use at least 8 characters' },
            })}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm_password?.message}
            {...register('confirm_password', {
              required: 'Confirm your password',
              validate: (v) => v === watch('password') || 'Passwords do not match',
            })}
          />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting || googleBusy}>
            Create account
          </Button>
          <p className="text-center text-xs leading-relaxed text-metal-400">
            We'll email you a link to verify your address. You can sign in once it is confirmed.
            If it does not arrive, check your spam or promotions folder.
          </p>
        </form>

        {googleEnabled && (
          <>
            <div className="my-6 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-metal-400">
                or sign up with
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <GoogleAuthButton onCredential={onGoogleCredential} label="Sign up with Google" />
          </>
        )}
      </AuthShell>
    </>
  )
}
