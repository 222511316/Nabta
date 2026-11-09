import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatDate } from '../../lib/dates'
import { formatPercent } from '../../lib/format'
import { CaseStatusPill } from '../reviews/CaseStatusPill'
import { pestName } from '../../lib/pestName'

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
        <Result analysis={observation.analysis} />
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {observation.notes ?? t('observationCard.noNotes')}
        </p>
        {observation.review_status && (
          <CaseStatusPill viewer="grower" status={observation.review_status} className="mt-3" />
        )}
      </div>
    </article>
  )
}

/** Nabta's result in the plant's history (FR10): "Aphids 92%" or "Unclear". */
function Result({ analysis }) {
  const { t, i18n } = useTranslation()
  if (!analysis) return null
  if (analysis.outcome === 'unclear') {
    return <p className="mt-1 text-sm font-medium text-muted">{t('observationCard.unclear')}</p>
  }
  return (
    <p className="mt-1 flex items-baseline gap-2 text-sm">
      <span className="font-medium text-forest-700">{pestName(t, analysis.category)}</span>
      <span className="text-muted tabular-nums">{formatPercent(analysis.confidence, i18n.language)}</span>
    </p>
  )
}
