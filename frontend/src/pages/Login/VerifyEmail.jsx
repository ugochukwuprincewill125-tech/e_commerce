import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import Seo from '../../components/Seo/Seo'
import { useAuth } from '../../context/AuthContext'
import { errorMessage } from '../../services/api'
import { authService } from '../../services/authService'

export default function VerifyEmail() {
  const { uid, token } = useParams()
  const { user, refreshUser } = useAuth()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['verify-email', uid, token],
    queryFn: () => authService.verifyEmail(uid, token),
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (data && user) refreshUser().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return (
    <>
      <Seo title="Verify email" noindex />
      <div className="container flex min-h-[60vh] items-center justify-center py-16 text-center">
        <div className="max-w-md">
          {isLoading ? (
            <>
              <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-brand-500" />
              <h1 className="mt-6 text-2xl font-bold">Verifying your email…</h1>
            </>
          ) : isError ? (
            <>
              <XCircle className="mx-auto h-14 w-14 text-danger" />
              <h1 className="mt-6 text-2xl font-bold">Verification link invalid</h1>
              <p className="mt-2 text-metal-500">{errorMessage(error)} You can request a new link from your dashboard.</p>
              <Button to={user ? '/account' : '/login'} className="mt-8">
                {user ? 'Go to dashboard' : 'Sign in'}
              </Button>
            </>
          ) : (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
              <h1 className="mt-6 text-2xl font-bold">Email verified</h1>
              <p className="mt-2 text-metal-500">{data.detail}</p>
              <Button to={user ? '/account' : '/login'} className="mt-8">
                Continue
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
