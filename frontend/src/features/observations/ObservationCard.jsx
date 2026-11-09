import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatDate } from '../../lib/dates'

export function ObservationCard({ observation }) {
  const { t, i18n } = useTranslation()
  const date = formatDate(observation.observed_on, i18n.language)

  return (
    <article className="group relative overflow-hidden rounded-xl border border-line bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-forest-500">
      <div className="aspect-square overflow-hidden bg-sage-50">
        <img
          src={observation.thumb_url}
          alt={t('observationCard.thumbAlt', { date })}
          loading="lazy"
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="p-3.5">
        <h3 className="font-medium text-ink">
          <Link
            to={`/observations/${observation.id}`}
            className="outline-none after:absolute after:inset-0 group-hover:text-forest-700"
          >
            {date}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {observation.notes ?? t('observationCard.noNotes')}
        </p>
      </div>
    </article>
  )
}
