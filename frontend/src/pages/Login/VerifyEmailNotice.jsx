import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import Seo from '../../components/Seo/Seo'
import { useToast } from '../../context/ToastContext'
import { errorMessage } from '../../services/api'
import { authService } from '../../services/authService'
import { ACCOUNT_HOME, safeNext } from '../../utils/navigation'
import AuthShell from './AuthShell'

export default function VerifyEmailNotice() {
  const [params] = useSearchParams()
  const toast = useToast()
  const next = safeNext(params.get('next'), ACCOUNT_HOME)
  const [email, setEmail] = useState(params.get('email') || '')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const loginHref = `/login${next && next !== ACCOUNT_HOME ? `?next=${encodeURIComponent(next)}` : ''}`

  const onSubmit = async (event) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) {
      setError('Enter the email address you registered with.')
      return
    }
    setError('')
    setSending(true)
    try {
      const data = await authService.resendVerification(address)
      setSent(true)
      toast.success('Verification email requested', data.detail)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Seo title="Verify your email" noindex />
      <AuthShell
        title="Check your inbox"
        subtitle="One quick step before you can sign in."
        footer={
          <>
            Already verified?{' '}
            <Link
              to={loginHref}
              className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-800 hover:decoration-brand-500"
            >
              Sign in
            </Link>
          </>
        }
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <MailCheck className="h-7 w-7" strokeWidth={1.7} aria-hidden />
          </div>
          <p className="mt-5 text-sm leading-relaxed text-metal-600">
            We sent a verification link to{' '}
            <strong className="break-all font-semibold text-ink-900">
              {email || 'your email address'}
            </strong>
            . Open it, then come back to sign in.
          </p>
        </div>

        <div className="mt-6 rounded-md border border-line bg-metal-50 px-4 py-3 text-[13px] leading-relaxed text-metal-600">
          The link expires after a while. If it has expired, or you cannot find the email, request a
          fresh one below. Check your spam folder too.
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="verify-email" className="label">
              Email address
            </label>
            <input
              id="verify-email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setSent(false)
              }}
              placeholder="you@example.com"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-[13px] font-medium text-danger">
              {error}
            </p>
          )}
          {sent && (
            <p role="status" className="text-[13px] font-medium text-emerald-700">
              Request received. If that address still needs verification, a new link is on its way.
            </p>
          )}
          <Button type="submit" variant="outline" className="w-full" loading={sending}>
            Resend verification email
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-metal-400">
          Wrong address?{' '}
          <Link to="/register" className="font-semibold text-brand-700 underline underline-offset-4">
            Start over
          </Link>{' '}
          with the correct one.
        </p>
      </AuthShell>
    </>
  )
}
