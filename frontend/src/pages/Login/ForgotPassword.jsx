import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import Seo from '../../components/Seo/Seo'
import { errorMessage } from '../../services/api'
import { authService } from '../../services/authService'
import AuthShell from './AuthShell'

export default function ForgotPassword() {
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = handleSubmit(async ({ email }) => {
    setError('')
    try {
      const res = await authService.forgotPassword(email)
      setSent(res.detail)
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  return (
    <>
      <Seo title="Forgot password" noindex />
      <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send you a secure reset link." footer={<Link to="/login" className="font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400">← Back to sign in</Link>}>
        {sent ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
            <MailCheck className="mx-auto h-8 w-8 text-success" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-semibold text-emerald-900">Check your inbox</p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-800">{sent}</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <FormAlert>{error}</FormAlert>
            <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email', { required: 'Email is required' })} />
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>
        )}
      </AuthShell>
    </>
  )
}
