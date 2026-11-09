import { useQuery } from '@tanstack/react-query'
import { Camera, Plus, Sprout } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listPlants } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { useAuth } from '../../auth/useAuth'
import { ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { EmptyState, PageHeader } from '../../components/ui/layout'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PlantCard } from './PlantCard'

function partOfDay(now = new Date()) {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  return hour < 18 ? 'afternoon' : 'evening'
}

/** "Good evening, Sara. You're keeping records for 3 plants, with 5 observations so far." */
function Welcome({ user, plants }) {
  const { t } = useTranslation()
  const greeting = t(`dashboard.greeting.${partOfDay()}`, { name: user.full_name.split(' ')[0] })
  if (!plants?.length) return greeting
  const observations = plants.reduce((sum, plant) => sum + plant.observation_count, 0)
  const counts = {
    plants: t('counts.plants', { count: plants.length }),
    observations: t('counts.observations', { count: observations }),
  }
  const summary = observations
    ? t('dashboard.summary', counts)
    : t('dashboard.summaryNoObservations', counts)
  return `${greeting} ${summary}`
}

export function DashboardPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('dashboard.title'))
  const { user } = useAuth()
  const plants = useQuery({ queryKey: queryKeys.plants, queryFn: listPlants })
  const hasPlants = plants.data?.length > 0

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={<Welcome user={user} plants={plants.data} />}
        actions={
          hasPlants && (
            <>
              <ButtonLink to="/plants/new" variant="secondary">
                <Plus />
                {t('dashboard.addPlant')}
              </ButtonLink>
              <ButtonLink to="/observations/new">
                <Camera />
                {t('dashboard.newObservation')}
              </ButtonLink>
            </>
          )
        }
      />

      {plants.isPending ? (
        <PageSpinner />
      ) : plants.isError ? (
        <LoadError message={t('dashboard.loadError')} onRetry={() => plants.refetch()} />
      ) : hasPlants ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plants.data.map((plant, index) => (
            <li key={plant.id} className="animate-rise stagger" style={{ '--i': index }}>
              <PlantCard plant={plant} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Sprout}
          title={t('dashboard.emptyTitle')}
          action={
            <ButtonLink to="/plants/new">
              <Plus />
              {t('dashboard.addPlant')}
            </ButtonLink>
          }
        >
          {t('dashboard.emptyBody')}
        </EmptyState>
      )}
    </>
  )
}
