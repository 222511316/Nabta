import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Description } from '@headlessui/react'
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

/** Asks before a destructive action. Focus is trapped inside while open. */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, confirming }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onClose={confirming ? () => {} : onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-forest-950/40 transition-opacity duration-150 data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center">
        <DialogPanel
          transition
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-raised transition duration-150 data-closed:scale-95 data-closed:opacity-0"
        >
          <div className="flex gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600">
              <TriangleAlert className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-ink">{title}</DialogTitle>
              <Description className="mt-2 text-sm leading-relaxed text-muted">{children}</Description>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={confirming}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={confirming}>
              {confirmLabel}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
