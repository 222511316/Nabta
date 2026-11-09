import { Description, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../lib/cx'
import { Alert } from './Alert'
import { Button } from './Button'

/**
 * A dialog around a short form: an icon, a title, the fields, and Cancel beside the
 * submit button. `tone="danger"` for forms that delete something.
 */
export function FormDialog({
  open,
  onClose,
  onSubmit,
  icon: Icon,
  title,
  description,
  submitLabel,
  submitting = false,
  error,
  tone = 'default',
  children,
}) {
  const { t } = useTranslation()
  const close = () => {
    if (!submitting) onClose()
  }

  return (
    <Dialog open={open} onClose={close} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-forest-950/40 transition-opacity duration-150 data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <DialogPanel
          transition
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-raised transition duration-150 data-closed:scale-95 data-closed:opacity-0"
        >
          <form onSubmit={onSubmit} noValidate>
            <div className="flex gap-4">
              {Icon && (
                <div
                  className={cx(
                    'flex size-11 shrink-0 items-center justify-center rounded-full',
                    tone === 'danger' ? 'bg-danger-50 text-danger-600' : 'bg-forest-50 text-forest-700',
                  )}
                >
                  <Icon className="size-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold text-ink">{title}</DialogTitle>
                {description && (
                  <Description as="div" className="mt-2 text-sm leading-relaxed text-muted">
                    {description}
                  </Description>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-5">{children}</div>

            {error && (
              <Alert tone="danger" className="mt-4">
                {error}
              </Alert>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close} disabled={submitting}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={submitting}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
