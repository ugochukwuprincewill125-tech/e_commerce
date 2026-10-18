import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import Seo from '../../components/Seo/Seo'
import { useToast } from '../../context/ToastContext'
import useConfirmAction from '../../hooks/useConfirmAction'
import { errorMessage, fieldErrors } from '../../services/api'
import { authService } from '../../services/authService'
import AuthShell from './AuthShell'

export default function ResetPassword() {
  const { uid, token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirmAction()
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm()

  const doReset = async (values) => {
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
  }

  // Saving always asks for confirmation first.
  const onSubmit = handleSubmit((values) =>
    confirm.ask({
      title: 'Update your password?',
      body: 'Are you sure you want to save this? Your password will change to the new one you just entered and you will be asked to sign in with it.',
      confirmLabel: 'Update password',
      tone: 'primary',
      action: () => doReset(values),
    }),
  )

  return (
    <>
      <Seo title="Choose a new password" noindex />
      <AuthShell title="Choose a new password" footer={<Link to="/forgot-password" className="font-semibold text-ink-900 underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400">Request a new link</Link>}>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormAlert>{error}</FormAlert>
          <Field label="New password" type="password" autoComplete="new-password" error={errors.new_password?.message} {...register('new_password', { required: 'Enter a new password', minLength: { value: 8, message: 'Use at least 8 characters' } })} />
          <Field label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register('confirm_password', { validate: (v) => v === watch('new_password') || 'Passwords do not match' })} />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting || confirm.busy}>
            Update password
          </Button>
        </form>
      </AuthShell>

      {confirm.modal}
    </>
  )
}
