import { useQuery } from '@tanstack/react-query'
import { Camera, Images } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { listObservations } from '../../api/observations'
import { getPlant } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, EmptyState, PageHeader } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PlantNotFound } from '../plants/PlantNotFound'
import { observationResult } from '../observations/observationResult'
import { DateRibbon } from './DateRibbon'

const SLOTS = ['a', 'b']

/** Two of a plant's photos side by side, picked from the date ribbon (US20, FR19). */
export function ComparePage() {
  const { t } = useTranslation()
  const { plantId } = useParams()
  const plant = useQuery({ queryKey: queryKeys.plant(plantId), queryFn: () => getPlant(plantId) })
  const observations = useQuery({
    queryKey: queryKeys.plantObservations(plantId),
    queryFn: () => listObservations(plantId),
  })
  useDocumentTitle(plant.data ? t('compare.documentTitle', { plant: plant.data.name }) : null)

  if (plant.isPending || observations.isPending) return <PageSpinner />
  if (plant.isError && plant.error.code === 'not_found') return <PlantNotFound />
  const failed = plant.isError ? plant : observations.isError ? observations : null
  if (failed) return <LoadError message={errorMessage(t, failed.error)} onRetry={() => failed.refetch()} />
  return <Comparison plant={plant.data} observations={observations.data} />
}

function Comparison({ plant, observations }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [choosing, setChoosing] = useState('b')

  // Oldest first, as time runs along the ribbon.
  const timeline = [...observations].sort(
    (x, y) => x.observed_on.localeCompare(y.observed_on) || x.id - y.id,
  )
  const byId = (id) => timeline.find((observation) => observation.id === Number(id))
  const selected = {
    a: (byId(searchParams.get('a')) ?? timeline[0])?.id,
    b: (byId(searchParams.get('b')) ?? timeline.at(-1))?.id,
  }

  const pick = (observationId) => {
    const next = new URLSearchParams(searchParams)
    next.set('a', String(selected.a))
    next.set('b', String(selected.b))
    next.set(choosing, String(observationId))
    setSearchParams(next, { replace: true })
  }

  const header = (
    <PageHeader
      breadcrumb={
        <Breadcrumb
          items={[
            { label: t('nav.dashboard'), to: '/dashboard' },
            { label: plant.name, to: `/plants/${plant.id}` },
            { label: t('compare.crumb') },
          ]}
        />
      }
      title={t('compare.title')}
      description={timeline.length >= 2 ? t('compare.subtitle') : null}
    />
  )

  if (timeline.length < 2) {
    return (
      <>
        {header}
        <EmptyState
          icon={Images}
          title={t('compare.notEnoughTitle')}
          action={
            <ButtonLink to={`/observations/new?plantId=${plant.id}`}>
              <Camera />
              {t('plant.addObservation')}
            </ButtonLink>
          }
        >
          {t('compare.notEnoughBody')}
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        {SLOTS.map((slot) => (
          <ComparedPhoto
            key={slot}
            slot={slot}
            observation={byId(selected[slot])}
            choosing={choosing === slot}
            onChoose={() => setChoosing(slot)}
          />
        ))}
      </div>

      <Card className="mt-8 px-2 pt-5 pb-4 sm:px-4">
        <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-forest-800">{t('compare.ribbonTitle', { count: timeline.length })}</h2>
          <div role="group" aria-label={t('compare.choosingLabel')} className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t('compare.choosing')}</span>
            {SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                aria-pressed={choosing === slot}
                onClick={() => setChoosing(slot)}
                className={cx(
                  'min-h-9 rounded-full border px-3.5 font-medium transition-colors',
                  choosing === slot
                    ? 'border-forest-700 bg-forest-700 text-white'
                    : 'border-line-strong bg-white text-forest-800 hover:bg-forest-50',
                )}
              >
                {t('compare.photoSlot', { slot: t(`compare.slots.${slot}`) })}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <DateRibbon observations={timeline} selected={selected} onPick={pick} />
        </div>
      </Card>
    </>
  )
}

function ComparedPhoto({ slot, observation, choosing, onChoose }) {
  const { t, i18n } = useTranslation()
  const date = formatDate(observation.observed_on, i18n.language)
  const result = observationResult(t, observation)

  return (
    <figure className="min-w-0">
      <button
        type="button"
        onClick={onChoose}
        aria-label={t('compare.chooseFor', { slot: t(`compare.slots.${slot}`) })}
        aria-pressed={choosing}
        className={cx(
          'relative block aspect-square w-full overflow-hidden rounded-xl border bg-sage-50 shadow-card transition sm:aspect-[4/3]',
          choosing ? 'border-forest-600 ring-3 ring-forest-500/30' : 'border-line hover:border-sage-400',
        )}
      >
        <img
          key={observation.id}
          src={observation.photo_url}
          alt={t('observation.photoAlt', { plant: observation.plant_name, date })}
          className="size-full animate-fade-in object-contain"
        />
        <span className="absolute start-2 top-2 flex size-7 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white shadow-sm">
          {t(`compare.slots.${slot}`)}
        </span>
      </button>
      <figcaption className="mt-3 space-y-1">
        <Link
          to={`/observations/${observation.id}`}
          className="font-semibold text-forest-800 underline-offset-4 hover:underline"
        >
          {date}
        </Link>
        {result && <p className="text-sm font-medium text-forest-700">{result}</p>}
        {observation.notes && <p className="line-clamp-3 text-sm text-muted">{observation.notes}</p>}
      </figcaption>
    </figure>
  )
}
