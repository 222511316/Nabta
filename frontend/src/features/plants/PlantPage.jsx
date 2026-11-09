import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImagePlus, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { listObservations } from '../../api/observations'
import { deletePlant, getPlant } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, EmptyState, PageHeader } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { formatDay } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useAiStatus } from '../ai/useAiStatus'
import { plantMeta } from './plantMeta'
import { ObservationCard } from '../observations/ObservationCard'
import { PlantNotFound } from './PlantNotFound'

export function PlantPage() {
  const { t } = useTranslation()
  const { plantId } = useParams()
  const plant = useQuery({ queryKey: queryKeys.plant(plantId), queryFn: () => getPlant(plantId) })
  useDocumentTitle(plant.data?.name)

  if (plant.isPending) return <PageSpinner />
  if (plant.isError) {
    return plant.error.code === 'not_found' ? (
      <PlantNotFound />
    ) : (
      <LoadError message={errorMessage(t, plant.error)} onRetry={() => plant.refetch()} />
    )
  }
  return <PlantProfile plant={plant.data} />
}

function PlantProfile({ plant }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const ai = useAiStatus()

  const remove = useMutation({
    mutationFn: () => deletePlant(plant.id),
    onSuccess: () => {
      // Mark (not remove) the deleted plant's data: removing it while this page is
      // still mounted would make the page fetch it again before navigating away.
      queryClient.invalidateQueries({ queryKey: queryKeys.plant(plant.id), refetchType: 'none' })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants, exact: true })
      toast.success(t('plant.deleted', { name: plant.name }))
      navigate('/dashboard', { replace: true })
    },
  })

  const deleteBody =
    plant.observation_count === 0
      ? t('plant.deleteBodyEmpty')
      : t('plant.deleteBody', { count: plant.observation_count })

  const details = [
    { label: t('plant.type'), value: plant.plant_type },
    { label: t('plant.location'), value: plant.location },
    { label: t('plant.added'), value: formatDay(plant.created_at, i18n.language) },
  ]

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb items={[{ label: t('nav.dashboard'), to: '/dashboard' }, { label: plant.name }]} />
        }
        title={plant.name}
        description={plantMeta(plant) || null}
        actions={
          <>
            <Button variant="dangerGhost" onClick={() => setConfirmingDelete(true)}>
              <Trash2 />
              {t('plant.delete')}
            </Button>
            <ButtonLink to={`/plants/${plant.id}/edit`} variant="secondary">
              <Pencil />
              {t('plant.edit')}
            </ButtonLink>
            {ai.enabled && (
              <ButtonLink to={`/plants/${plant.id}/report`} variant="secondary">
                <Sparkles />
                {t('report.open')}
              </ButtonLink>
            )}
            <ButtonLink to={`/observations/new?plantId=${plant.id}`}>
              <Camera />
              {t('plant.addObservation')}
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="p-6" aria-labelledby="plant-details-heading">
          <h2 id="plant-details-heading" className="font-semibold text-forest-800">
            {t('plant.details')}
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {value ?? <span className="font-normal text-muted">{t('plant.notSet')}</span>}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-muted">{t('plant.notes')}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-ink">
                {plant.notes ?? <span className="text-muted">{t('plant.noNotes')}</span>}
              </dd>
            </div>
          </dl>
        </Card>

        <ObservationHistory plant={plant} />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => remove.mutate()}
        confirming={remove.isPending}
        title={t('plant.deleteTitle', { name: plant.name })}
        confirmLabel={remove.isPending ? t('plant.deleting') : t('plant.deleteConfirm')}
      >
        {deleteBody}
        {remove.isError && (
          <Alert tone="danger" className="mt-4">
            {errorMessage(t, remove.error)}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  )
}

function ObservationHistory({ plant }) {
  const { t } = useTranslation()
  const observations = useQuery({
    queryKey: queryKeys.plantObservations(plant.id),
    queryFn: () => listObservations(plant.id),
  })

  return (
    <section aria-labelledby="observations-heading">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="observations-heading" className="text-lg font-semibold text-forest-800">
          {t('plant.observationsTitle')}
          {observations.data?.length > 0 && (
            <span className="ms-2 text-base font-normal text-muted">({observations.data.length})</span>
          )}
        </h2>
      </div>

      {observations.isPending ? (
        <PageSpinner />
      ) : observations.isError ? (
        <LoadError message={errorMessage(t, observations.error)} onRetry={() => observations.refetch()} />
      ) : observations.data.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          headingLevel="h3"
          title={t('plant.observationsEmptyTitle')}
          action={
            <ButtonLink to={`/observations/new?plantId=${plant.id}`} variant="secondary">
              <Camera />
              {t('plant.addObservation')}
            </ButtonLink>
          }
        >
          {t('plant.observationsEmptyBody')}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {observations.data.map((observation, index) => (
            <li key={observation.id} className="animate-rise stagger" style={{ '--i': index }}>
              <ObservationCard observation={observation} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
