import { MailCheck, RefreshCw } from 'lucide-react'
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
  const [sentTo, setSentTo] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = handleSubmit(async ({ email }) => {
    setError('')
    try {
      const res = await authService.forgotPassword(email)
      setSentTo(email.trim())
      setDetail(res.detail)
      setResent(false)
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  const resend = async () => {
    if (!sentTo) return
    setError('')
    setResent(false)
    setResending(true)
    try {
      const res = await authService.forgotPassword(sentTo)
      setDetail(res.detail)
      setResent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <Seo title="Forgot password" noindex />
      <AuthShell
        title="Reset your password"
        subtitle="Enter your email and we'll send you a secure reset link."
        footer={
          <Link
            to="/login"
            className="font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400"
          >
            Back to sign in
          </Link>
        }
      >
        {sentTo ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-5 text-center">
              <MailCheck className="mx-auto h-8 w-8 text-brand-700" strokeWidth={1.75} />
              <p className="mt-3 text-sm font-semibold text-ink-900">Check your inbox</p>
              <p className="mt-1 text-sm leading-relaxed text-metal-700">
                {detail || 'If an account exists for that address, a reset link is on its way.'}
              </p>
              <p className="mt-3 break-all text-sm font-semibold text-ink-900">{sentTo}</p>
            </div>

            <div className="rounded-md border border-line bg-metal-50 px-4 py-3 text-[13px] leading-relaxed text-metal-600">
              It can take a minute or two. If you do not see it, check your spam or promotions
              folder, and make sure you used the email address on your account.
            </div>

            {resent && (
              <p role="status" className="text-center text-[13px] font-medium text-emerald-700">
                A fresh reset link was requested.
              </p>
            )}

            <FormAlert>{error}</FormAlert>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                loading={resending}
                onClick={resend}
                icon={RefreshCw}
              >
                Send again
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSentTo('')
                  setDetail('')
                  setError('')
                  setResent(false)
                }}
              >
                Use a different email
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <FormAlert>{error}</FormAlert>
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email', { required: 'Email is required' })}
            />
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>
            <p className="text-center text-xs leading-relaxed text-metal-400">
              We'll email a reset link if this address belongs to an account.
            </p>
          </form>
        )}
      </AuthShell>
    </>
  )
}
