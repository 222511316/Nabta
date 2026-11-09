import { useQuery } from '@tanstack/react-query'
import { ExternalLink, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { getObservation } from '../../api/observations'
import { queryKeys } from '../../api/queryKeys'
import { ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, PageHeader, StatusPanel } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { formatDate, formatDateTime } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

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
  const date = formatDate(observation.observed_on, i18n.language)
  const title = t('observation.title', { date })
  useDocumentTitle(title)
  const plantLink = (
    <Link
      to={`/plants/${observation.plant_id}`}
      className="font-medium text-forest-700 underline-offset-4 hover:underline"
    >
      {observation.plant_name}
    </Link>
  )

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

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <figure className="overflow-hidden rounded-2xl border border-line bg-sage-50 shadow-card">
          <img
            src={observation.photo_url}
            alt={t('observation.photoAlt', { plant: observation.plant_name, date })}
            width={observation.photo_width}
            height={observation.photo_height}
            className="mx-auto max-h-[70vh] w-full object-contain"
          />
          <figcaption className="flex justify-end border-t border-line bg-white px-4 py-2.5">
            <a
              href={observation.photo_url}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-forest-700 hover:bg-forest-50"
            >
              <ExternalLink className="size-4" />
              {t('observation.openFull')}
            </a>
          </figcaption>
        </figure>

        <Card className="p-6">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-muted">{t('observation.plant')}</dt>
              <dd className="mt-0.5">{plantLink}</dd>
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
        </Card>
      </div>
    </>
  )
}
