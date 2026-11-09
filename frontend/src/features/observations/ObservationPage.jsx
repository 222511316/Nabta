import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { deleteObservation, getObservation } from '../../api/observations'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, PageHeader, StatusPanel } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { formatDate, formatDateTime } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { AnalysisPanel } from '../analysis/AnalysisPanel'
import { PhotoStage } from '../analysis/PhotoStage'
import { useObservationAnalysis } from '../analysis/useObservationAnalysis'
import { GrowerReviewPanel } from '../reviews/GrowerReviewPanel'
import { RequestReviewDialog } from '../reviews/RequestReviewDialog'

export function ObservationPage() {
  const { t } = useTranslation()
  const { observationId } = useParams()
  const observation = useQuery({
    queryKey: queryKeys.observation(observationId),
    queryFn: () => getObservation(observationId),
  })

  if (observation.isPending) return <PageSpinner />
  if (observation.isError) {
    return observation.error.code === 'not_found' ? (
      <StatusPanel
        icon={SearchX}
        title={t('observation.notFoundTitle')}
        action={<ButtonLink to="/dashboard">{t('plant.backToDashboard')}</ButtonLink>}
      >
        {t('observation.notFoundBody')}
      </StatusPanel>
    ) : (
      <LoadError message={errorMessage(t, observation.error)} onRetry={() => observation.refetch()} />
    )
  }
  return <ObservationDetails observation={observation.data} />
}

function ObservationDetails({ observation }) {
  const { t, i18n } = useTranslation()
  const analysis = useObservationAnalysis(observation)
  const [asking, setAsking] = useState(false)
  const date = formatDate(observation.observed_on, i18n.language)
  const title = t('observation.title', { date })
  useDocumentTitle(title)
  const canAsk = !observation.review_status

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t('nav.dashboard'), to: '/dashboard' },
              { label: observation.plant_name, to: `/plants/${observation.plant_id}` },
              { label: date },
            ]}
          />
        }
        title={title}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* The photo stays in view while the suggestion and review are read beside it. */}
        <div className="lg:sticky lg:top-24">
          <PhotoStage
            src={observation.photo_url}
            alt={t('observation.photoAlt', { plant: observation.plant_name, date })}
            width={observation.photo_width}
            height={observation.photo_height}
            analysis={analysis}
          />
        </div>

        <div className="space-y-6">
          <AnalysisPanel
            observation={observation}
            analysis={analysis}
            onAsk={canAsk ? () => setAsking(true) : undefined}
          />
          {!canAsk && <GrowerReviewPanel observation={observation} />}
          <ObservationFacts observation={observation} date={date} />
        </div>
      </div>

      {canAsk && <RequestReviewDialog observation={observation} open={asking} onClose={() => setAsking(false)} />}
    </>
  )
}

function ObservationFacts({ observation, date }) {
  const { t, i18n } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  return (
    <Card aria-labelledby="observation-facts-heading" className="p-6">
      <h2 id="observation-facts-heading" className="font-semibold text-forest-800">
        {t('observation.details')}
      </h2>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-muted">{t('observation.plant')}</dt>
          <dd className="mt-0.5">
            <Link
              to={`/plants/${observation.plant_id}`}
              className="font-medium text-forest-700 underline-offset-4 hover:underline"
            >
              {observation.plant_name}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t('observation.observedOn')}</dt>
          <dd className="mt-0.5 font-medium text-ink">{date}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('observation.savedAt')}</dt>
          <dd className="mt-0.5 text-ink">{formatDateTime(observation.created_at, i18n.language)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('observation.notes')}</dt>
          <dd className="mt-0.5 whitespace-pre-line text-ink">
            {observation.notes ?? <span className="text-muted">{t('observation.noNotes')}</span>}
          </dd>
        </div>
      </dl>
      <div className="mt-6 border-t border-line pt-4">
        <Button variant="dangerGhost" size="sm" className="-ms-3.5" onClick={() => setDeleting(true)}>
          <Trash2 />
          {t('observation.delete')}
        </Button>
      </div>
      <DeleteObservationDialog observation={observation} date={date} open={deleting} onClose={() => setDeleting(false)} />
    </Card>
  )
}

/** US22: one observation goes with its photo, Nabta's result and any review. */
function DeleteObservationDialog({ observation, date, open, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => deleteObservation(observation.id),
    onSuccess: () => {
      // Marked, not removed: this page is still mounted until the navigation below.
      queryClient.invalidateQueries({ queryKey: queryKeys.observation(observation.id), refetchType: 'none' })
      for (const queryKey of [
        queryKeys.plant(observation.plant_id),
        queryKeys.plants,
        queryKeys.reviews,
        queryKeys.tasks,
        queryKeys.summary,
        ['search'],
      ]) {
        queryClient.invalidateQueries({ queryKey })
      }
      toast.success(t('observation.deleted'))
      navigate(`/plants/${observation.plant_id}`, { replace: true })
    },
  })

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => remove.mutate()}
      confirming={remove.isPending}
      title={t('observation.deleteTitle', { date })}
      confirmLabel={remove.isPending ? t('plant.deleting') : t('observation.deleteConfirm')}
    >
      {observation.review_status ? t('observation.deleteBodyReview') : t('observation.deleteBody')}
      {remove.isError && (
        <Alert tone="danger" className="mt-4">
          {errorMessage(t, remove.error)}
        </Alert>
      )}
    </ConfirmDialog>
  )
}
