import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import Button from '../../components/Button/Button'
import EmptyState, { ErrorState } from '../../components/EmptyState/EmptyState'
import { Field, FormAlert } from '../../components/Form/Field'
import { Skeleton } from '../../components/Loader/Skeleton'
import Modal from '../../components/Modal/Modal'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import useStoreInfo from '../../hooks/useStoreInfo'
import { errorMessage, fieldErrors } from '../../services/api'
import { userService } from '../../services/authService'

function AddressForm({ initial, onSaved, onCancel }) {
  const { user } = useAuth()
  const { states } = useStoreInfo()
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: initial || { first_name: user.first_name, last_name: user.last_name, phone: user.phone, country: 'Nigeria', state: 'Lagos', is_default: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError('')
    try {
      const saved = initial?.id ? await userService.updateAddress(initial.id, values) : await userService.createAddress(values)
      onSaved(saved)
    } catch (err) {
      const fe = fieldErrors(err)
      Object.entries(fe).forEach(([k, v]) => setFieldError(k, { message: v }))
      setError(errorMessage(err))
    }
  })

  const req = { required: 'Required' }
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <Field label="Label (optional)" placeholder="Home, Office…" className="sm:col-span-2" {...register('label')} />
      <Field label="First name" error={errors.first_name?.message} {...register('first_name', req)} />
      <Field label="Last name" error={errors.last_name?.message} {...register('last_name', req)} />
      <Field label="Phone" type="tel" error={errors.phone?.message} className="sm:col-span-2" {...register('phone', req)} />
      <Field label="Street address" error={errors.address?.message} className="sm:col-span-2" {...register('address', req)} />
      <Field label="City / Area" error={errors.city?.message} {...register('city', req)} />
      <Field as="select" label="State" error={errors.state?.message} {...register('state', req)}>
        {states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Field>
      <Field label="Country" {...register('country', req)} />
      <Field label="Postal code" {...register('postal_code')} />
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <input type="checkbox" className="h-4 w-4 rounded border-metal-300 text-ink-900" {...register('is_default')} /> Make this my default address
      </label>
      <div className="sm:col-span-2">
        <FormAlert>{error}</FormAlert>
      </div>
      <div className="flex justify-end gap-3 sm:col-span-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save address
        </Button>
      </div>
    </form>
  )
}

export default function Addresses() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null) // null | {} (new) | address
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ['addresses'], queryFn: userService.addresses })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['addresses'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const remove = async (a) => {
    try {
      await userService.deleteAddress(a.id)
      toast.info('Address removed')
      invalidate()
    } catch (err) {
      toast.error('Couldn’t remove address', errorMessage(err))
    }
  }

  const makeDefault = async (a) => {
    try {
      await userService.updateAddress(a.id, { is_default: true })
      invalidate()
    } catch (err) {
      toast.error('Couldn’t update address', errorMessage(err))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Addresses</h2>
        <Button icon={Plus} onClick={() => setEditing({})}>
          Add address
        </Button>
      </div>
      <div className="mt-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : !data.length ? (
          <EmptyState icon={MapPin} title="No saved addresses" message="Save delivery addresses for a faster checkout." action={{ label: 'Add address', onClick: () => setEditing({}) }} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {data.map((a) => (
                <motion.li key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`card p-5 ${a.is_default ? 'ring-2 ring-ink-900' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">
                      {a.label || `${a.first_name} ${a.last_name}`}
                      {a.is_default && <span className="chip ml-2 bg-ink-900 text-white">Default</span>}
                    </p>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setEditing(a)} className="rounded-lg p-1.5 text-metal-500 hover:bg-metal-100 hover:text-ink-900" aria-label="Edit address">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => remove(a)} className="rounded-lg p-1.5 text-metal-500 hover:bg-red-50 hover:text-danger" aria-label="Delete address">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-metal-600">
                    {a.first_name} {a.last_name} · {a.phone}
                    <br />
                    {a.address}, {a.city}, {a.state}, {a.country} {a.postal_code}
                  </p>
                  {!a.is_default && (
                    <button type="button" onClick={() => makeDefault(a)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700">
                      <Star className="h-3.5 w-3.5" /> Set as default
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit address' : 'New address'} size="max-w-2xl">
        {editing !== null && (
          <AddressForm
            initial={editing?.id ? editing : null}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              toast.success('Address saved')
              setEditing(null)
              invalidate()
            }}
          />
        )}
      </Modal>
    </div>
  )
}
