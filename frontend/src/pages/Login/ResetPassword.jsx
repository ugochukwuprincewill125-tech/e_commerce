import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import Seo from '../../components/Seo/Seo'
import { useToast } from '../../context/ToastContext'
import { errorMessage, fieldErrors } from '../../services/api'
import { authService } from '../../services/authService'
import AuthShell from './AuthShell'

export default function ResetPassword() {
  const { uid, token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    try {
      const res = await authService.resetPassword({ uid, token, ...values })
      toast.success(res.detail)
      navigate('/login', { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      setError(errorMessage(err))
    }
  })

  return (
    <>
      <Seo title="Choose a new password" noindex />
      <AuthShell title="Choose a new password" footer={<Link to="/forgot-password" className="font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400">Request a new link</Link>}>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormAlert>{error}</FormAlert>
          <Field label="New password" type="password" autoComplete="new-password" error={errors.new_password?.message} {...register('new_password', { required: 'Enter a new password', minLength: { value: 8, message: 'Use at least 8 characters' } })} />
          <Field label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register('confirm_password', { validate: (v) => v === watch('new_password') || 'Passwords do not match' })} />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Update password
          </Button>
        </form>
      </AuthShell>
    </>
  )
}
