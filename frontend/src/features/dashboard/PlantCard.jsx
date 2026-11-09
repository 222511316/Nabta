import { CalendarDays, Images } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LeafMark } from '../../components/brand/LeafMark'
import { formatDate } from '../../lib/dates'
import { plantMeta } from '../plants/plantMeta'

export function PlantCard({ plant }) {
  const { t, i18n } = useTranslation()
  const meta = plantMeta(plant)

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-forest-500">
      <div className="aspect-[16/9] overflow-hidden bg-sage-50 sm:aspect-[4/3]">
        {plant.cover_photo_url ? (
          <img
            src={plant.cover_photo_url}
            alt={t('plantCard.coverAlt', { name: plant.name })}
            loading="lazy"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-wash bg-field-grid">
            <LeafMark className="h-3/5 w-auto text-sage-400 transition duration-300 group-hover:scale-105 group-hover:text-sage-500" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="text-lg font-semibold text-ink">
          {/* The link's hit area covers the whole card. */}
          <Link
            to={`/plants/${plant.id}`}
            className="outline-none after:absolute after:inset-0 group-hover:text-forest-700"
          >
            {plant.name}
          </Link>
        </h2>
        {meta && <p className="mt-0.5 truncate text-sm text-muted">{meta}</p>}
        <div className="flex-1 pb-4" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-muted">
          {plant.observation_count > 0 ? (
            <>
              <span className="flex items-center gap-1.5">
                <Images className="size-4 text-sage-600" />
                {t('plantCard.observations', { count: plant.observation_count })}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-sage-600" />
                {t('plantCard.lastSeen', { date: formatDate(plant.last_observed_on, i18n.language) })}
              </span>
            </>
          ) : (
            <span>{t('plantCard.noObservations')}</span>
          )}
        </div>
      </div>
    </article>
  )
}
