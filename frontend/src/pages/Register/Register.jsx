import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage, fieldErrors } from '../../services/api'
import { safeNext } from '../../utils/navigation'
import AuthShell from '../Login/AuthShell'

export default function Register() {
  const { register: signUp } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const next = safeNext(params.get('next'), '/account')
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
      toast.success('Account created!', data.detail)
      navigate(next, { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      setError(Object.keys(fe).length ? '' : errorMessage(err))
    }
  })

  return (
    <>
      <Seo title="Create account" noindex />
      <AuthShell
        title="Create your account"
        subtitle="It only takes a minute."
        footer={
          <>
            Already have an account?{' '}
            <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400">
              Sign in
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormAlert>{error}</FormAlert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" autoComplete="given-name" error={errors.first_name?.message} {...register('first_name', { required: 'First name is required' })} />
            <Field label="Last name" autoComplete="family-name" error={errors.last_name?.message} {...register('last_name', { required: 'Last name is required' })} />
          </div>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })}
          />
          <Field label="Phone (optional)" type="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters. Avoid common or all-number passwords."
            error={errors.password?.message}
            {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Use at least 8 characters' } })}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm_password?.message}
            {...register('confirm_password', { validate: (v) => v === watch('password') || 'Passwords do not match' })}
          />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Create account
          </Button>
          <p className="text-center text-xs text-metal-400">We’ll send a link to verify your email address.</p>
        </form>
      </AuthShell>
    </>
  )
}
