import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { queryKeys } from '../../api/queryKeys'
import { getReview, replyToReview } from '../../api/reviews'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LoadError, SectionSpinner } from '../../components/ui/feedback'
import { TextAreaField } from '../../components/ui/fields'
import { Card } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { limits, rules } from '../../lib/validation'
import { AssessmentCard } from './AssessmentCard'
import { CaseStatusPill } from './CaseStatusPill'
import { CaseThread } from './CaseThread'

const OPEN_CASE_REFRESH_MS = 30_000

/** The specialist review of one observation, as its grower sees it (US13, US15, US16). */
export function GrowerReviewPanel({ observation }) {
  const { t } = useTranslation()
  const review = useQuery({
    queryKey: queryKeys.observationReview(observation.id),
    queryFn: () => getReview(observation.id),
    // An open case can change on the specialist's side; a closed one can't.
    refetchInterval: (query) => (query.state.data?.status === 'answered' ? false : OPEN_CASE_REFRESH_MS),
  })

  return (
    <Card aria-labelledby="review-heading" className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-heading" className="font-semibold text-forest-800">
          {t('review.title')}
        </h2>
        {review.data && <CaseStatusPill viewer="grower" status={review.data.status} />}
      </div>
      {review.isPending ? (
        <SectionSpinner />
      ) : review.isError ? (
        <div className="mt-4">
          <LoadError message={errorMessage(t, review.error)} onRetry={() => review.refetch()} />
        </div>
      ) : (
        <ReviewCase observation={observation} reviewCase={review.data} />
      )}
    </Card>
  )
}

function ReviewCase({ observation, reviewCase }) {
  const { t } = useTranslation()
  const { user } = useAuth()

  let summary = null
  if (reviewCase.status === 'waiting_for_specialist') {
    summary = reviewCase.specialist_name
      ? t('review.reviewing', { name: reviewCase.specialist_name })
      : t('review.waiting')
  }

  return (
    <div className="mt-4 space-y-5">
      {summary && <p className="text-sm text-muted">{summary}</p>}
      {reviewCase.feedback && <AssessmentCard feedback={reviewCase.feedback} />}
      <div>
        <h3 className="sr-only">{t('review.conversation')}</h3>
        <CaseThread
          request={{
            authorName: user.full_name,
            note: reviewCase.note,
            createdAt: reviewCase.created_at,
            label: t('review.yourRequest'),
          }}
          messages={reviewCase.messages}
          viewerName={user.full_name}
        />
      </div>
      {reviewCase.status === 'waiting_for_grower' && <ReplyForm observation={observation} reviewCase={reviewCase} />}
    </div>
  )
}

function ReplyForm({ observation, reviewCase }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const r = rules(t)
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { body: '' } })

  const reply = useMutation({
    mutationFn: ({ body }) => replyToReview(reviewCase.id, body.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.observationReview(observation.id), updated)
      queryClient.setQueryData(queryKeys.observation(observation.id), (current) =>
        current ? { ...current, review_status: updated.status } : current,
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews })
      toast.success(t('review.replySent'))
      reset()
    },
    onError: (error) => {
      if (error.code === 'case_closed') queryClient.invalidateQueries({ queryKey: queryKeys.observationReview(observation.id) })
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => reply.mutate(values))} noValidate className="space-y-3">
      <TextAreaField
        label={t('review.replyLabel')}
        rows={3}
        error={formState.errors.body?.message}
        {...register('body', r.requiredText(limits.caseMessage))}
      />
      {reply.isError && <Alert tone="danger">{errorMessage(t, reply.error)}</Alert>}
      <Button type="submit" loading={reply.isPending}>
        {t('review.sendReply')}
      </Button>
    </form>
  )
}
