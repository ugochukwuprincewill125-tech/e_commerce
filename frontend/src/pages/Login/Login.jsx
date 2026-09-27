import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage } from '../../services/api'
import { safeNext } from '../../utils/navigation'
import AuthShell from './AuthShell'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const next = safeNext(params.get('next'), '/account')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError('')
    try {
      const user = await login(email, password)
      toast.success(`Welcome back, ${user.first_name}!`)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.response?.status === 401 ? 'Incorrect email or password.' : errorMessage(err))
    }
  })

  return (
    <>
      <Seo title="Sign in" noindex />
      <AuthShell
        title="Welcome back"
        subtitle="Sign in to track orders, manage your wishlist and check out faster."
        footer={
          <>
            New to Timeline?{' '}
            <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400">
              Create an account
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormAlert>{error}</FormAlert>
          <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email', { required: 'Email is required' })} />
          <div>
            <Field label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password', { required: 'Password is required' })} />
            <div className="mt-2 text-right">
              <Link to="/forgot-password" className="text-[13px] font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700">
                Forgot password?
              </Link>
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </AuthShell>
    </>
  )
}
