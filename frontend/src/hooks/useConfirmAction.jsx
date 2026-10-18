import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import Modal from '../components/Modal/Modal'

/**
 * Shared "tap → confirm → act" flow for every destructive or permanent-feeling
 * button on the platform (all deletes and all saves/stores).
 *
 * Buttons call `ask({ title, body, confirmLabel, tone, action })` instead of
 * running the action directly; the action only executes once the user confirms
 * in the modal. Render `modal` once per component — it sits on a portal so it
 * stacks safely above any open form dialog.
 */
export function useConfirmAction() {
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)

  const ask = ({ title, body, confirmLabel = 'Confirm', tone = 'danger', action }) =>
    setPending({ title, body, confirmLabel, tone, action })

  const close = () => {
    if (!busy) setPending(null)
  }

  const run = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await pending.action()
      setPending(null)
    } catch {
      // The action (service call) already surfaced its own error
      // toast/notification; keep the modal open so the user can retry or cancel.
    } finally {
      setBusy(false)
    }
  }

  const modal = (
    <Modal open={Boolean(pending)} onClose={close} title={pending?.title || ''} size="max-w-md">
      <div className="p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-metal-600">{pending?.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className="btn-outline">
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className={pending?.tone === 'danger' ? 'btn bg-danger text-white hover:bg-red-700' : 'btn-primary'}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending?.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  )

  return { ask, modal, busy, close }
}

export default useConfirmAction
