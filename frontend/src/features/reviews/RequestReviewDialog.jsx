import { Description, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, MessageCircleQuestion } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { queryKeys } from '../../api/queryKeys'
import { requestReview } from '../../api/reviews'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextAreaField } from '../../components/ui/fields'
import { errorMessage } from '../../lib/apiErrors'
import { formatPercent } from '../../lib/format'
import { limits, rules } from '../../lib/validation'

/**
 * Asks a specialist to review an observation (US12). The dialog lists exactly what the
 * specialist will see before anything is sent (NFR06).
 */
export function RequestReviewDialog({ observation, open, onClose }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { note: '' } })
  const r = rules(t)

  const send = useMutation({
    mutationFn: ({ note }) => requestReview(observation.id, note.trim()),
    onSuccess: (reviewCase) => {
      queryClient.setQueryData(queryKeys.observationReview(observation.id), reviewCase)
      queryClient.setQueryData(queryKeys.observation(observation.id), (current) =>
        current ? { ...current, review_status: reviewCase.status } : current,
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews })
      queryClient.invalidateQueries({ queryKey: queryKeys.plantObservations(observation.plant_id) })
      toast.success(t('review.sent'))
      close()
    },
    onError: (error) => {
      // Someone already sent it (another tab): show the case that exists.
      if (error.code === 'review_exists') queryClient.invalidateQueries({ queryKey: queryKeys.observation(observation.id) })
    },
  })

  const close = () => {
    if (send.isPending) return
    onClose()
    reset()
    send.reset()
  }

  const analysis = observation.analysis
  const shares = [t('review.sharesPhoto')]
  if (analysis?.outcome === 'identified') {
    shares.push(
      t('review.sharesSuggestion', {
        name: analysis.category.name,
        percent: formatPercent(analysis.confidence, i18n.language),
      }),
    )
  } else if (analysis?.outcome === 'unclear') {
    shares.push(t('review.sharesUnclear'))
  }
  shares.push(t('review.sharesNotes'), t('review.sharesPlant'), t('review.sharesName'))

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
          <form onSubmit={handleSubmit((values) => send.mutate(values))} noValidate>
            <div className="flex gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-700">
                <MessageCircleQuestion className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold text-ink">{t('review.requestTitle')}</DialogTitle>
                <Description className="mt-2 text-sm text-muted">{t('review.requestIntro')}</Description>
                <ul className="mt-3 space-y-1.5 text-sm text-ink">
                  {shares.map((item) => (
                    <li key={item} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-forest-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <TextAreaField
              label={t('review.note')}
              hint={t('review.noteHint')}
              optional
              rows={3}
              className="mt-5"
              error={formState.errors.note?.message}
              {...register('note', r.optionalText(limits.reviewNote))}
            />

            {send.isError && (
              <Alert tone="danger" className="mt-4">
                {errorMessage(t, send.error)}
              </Alert>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close} disabled={send.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={send.isPending}>
                {send.isPending ? t('review.sending') : t('review.send')}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
