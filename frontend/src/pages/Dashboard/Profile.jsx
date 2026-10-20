import { Camera, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import Button from '../../components/Button/Button'
import { Field, FormAlert } from '../../components/Form/Field'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import useConfirmAction from '../../hooks/useConfirmAction'
import { errorMessage, fieldErrors, rememberedEmail } from '../../services/api'
import { authService } from '../../services/authService'

function ProfileForm() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirmAction()
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(user.profile_image)
  const [file, setFile] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ defaultValues: { first_name: user.first_name, last_name: user.last_name, email: user.email, phone: user.phone } })

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 3 * 1024 * 1024) return toast.error('Image too large', 'Please choose an image under 3MB.')
    setFile(f)
    setRemoveImage(false)
    setPreview(URL.createObjectURL(f))
    return undefined
  }

  const doSave = async (values) => {
    setError('')
    const form = new FormData()
    Object.entries(values).forEach(([k, v]) => form.append(k, v ?? ''))
    if (file) form.append('profile_image', file)
    if (removeImage) form.append('remove_profile_image', 'true')
    try {
      const updated = await authService.updateProfile(form)
      setFile(null)

      if (updated.email !== user.email) {
        if (rememberedEmail.get()) rememberedEmail.set(updated.email)
        toast.success(
          'Email updated',
          'Check your inbox to verify the new address, then sign in again.',
        )
        // Changing the email un-verifies the account. The old token is no
        // longer accepted, so navigate first and then clear the local session
        // without asking the server to revoke a token it will reject.
        navigate(`/verify-email?email=${encodeURIComponent(updated.email)}`, { replace: true })
        await logout({ remote: false })
        return
      }

      setUser(updated)
      toast.success('Profile updated')
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      setError(errorMessage(err))
    }
  }

  // Saving always asks for confirmation first.
  const onSubmit = handleSubmit((values) =>
    confirm.ask({
      title: 'Save these changes?',
      body: file
        ? 'Are you sure you want to save this? Your profile details and the new photo will be updated.'
        : removeImage
          ? 'Are you sure you want to save this? Your profile details will be updated and your photo removed.'
          : 'Are you sure you want to save this? Your profile details will be updated.',
      confirmLabel: 'Save changes',
      tone: 'primary',
      action: () => doSave(values),
    }),
  )

  return (
    <form onSubmit={onSubmit} className="card p-5 sm:p-7" noValidate>
      <h2 className="text-lg font-semibold">Personal information</h2>
      <div className="mt-6 flex items-center gap-5">
        <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-ink-900 text-2xl font-bold text-white">
          {preview ? <img src={preview} alt="Profile" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center">{user.first_name?.[0]}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} id="avatar" />
          <Button size="sm" variant="outline" icon={Camera} onClick={() => fileRef.current?.click()}>
            Change photo
          </Button>
          {preview && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                setPreview(null)
                setFile(null)
                setRemoveImage(true)
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.first_name?.message} {...register('first_name', { required: 'Required' })} />
        <Field label="Last name" error={errors.last_name?.message} {...register('last_name', { required: 'Required' })} />
        <Field label="Email" type="email" error={errors.email?.message} hint="Changing your email requires re-verification." {...register('email', { required: 'Required' })} />
        <Field label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
      </div>
      <div className="mt-5">
        <FormAlert>{error}</FormAlert>
      </div>
      <Button type="submit" className="mt-6" loading={isSubmitting || confirm.busy} disabled={!isDirty && !file && !removeImage}>
        Save changes
      </Button>
      {confirm.modal}
    </form>
  )
}

function PasswordForm() {
  const toast = useToast()
  const confirm = useConfirmAction()
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm()

  const doSave = async ({ current_password, new_password }) => {
    setError('')
    try {
      await authService.changePassword({ current_password, new_password })
      toast.success('Password updated')
      reset()
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      if (!Object.keys(fe).length) setError(errorMessage(err))
    }
  }

  // Saving always asks for confirmation first.
  const onSubmit = handleSubmit((values) =>
    confirm.ask({
      title: 'Update your password?',
      body: 'Are you sure you want to save this? Your sign-in password will change to the new one you just entered.',
      confirmLabel: 'Update password',
      tone: 'primary',
      action: () => doSave(values),
    }),
  )

  return (
    <form onSubmit={onSubmit} className="card p-5 sm:p-7" noValidate>
      <h2 className="text-lg font-semibold">Change password</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Current password" type="password" autoComplete="current-password" error={errors.current_password?.message} {...register('current_password', { required: 'Required' })} />
        <Field label="New password" type="password" autoComplete="new-password" error={errors.new_password?.message} {...register('new_password', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm', { validate: (v) => v === watch('new_password') || 'Passwords do not match' })} />
      </div>
      <div className="mt-5">
        <FormAlert>{error}</FormAlert>
      </div>
      <Button type="submit" className="mt-6" loading={isSubmitting || confirm.busy}>
        Update password
      </Button>
      {confirm.modal}
    </form>
  )
}

export default function Profile() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Profile</h2>
      <ProfileForm />
      <PasswordForm />
    </div>
  )
}
