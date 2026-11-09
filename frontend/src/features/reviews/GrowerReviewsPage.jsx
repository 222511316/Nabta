import { useQuery } from '@tanstack/react-query'
import { MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { queryKeys } from '../../api/queryKeys'
import { listReviews } from '../../api/reviews'
import { ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { EmptyState, PageHeader } from '../../components/ui/layout'
import { RelativeTime } from '../../components/ui/RelativeTime'
import { formatDate } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { CaseStatusPill } from './CaseStatusPill'

/** Every observation the grower has sent for review, with where each one stands (US13). */
export function GrowerReviewsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('reviews.title'))
  const reviews = useQuery({ queryKey: queryKeys.reviews, queryFn: listReviews, refetchInterval: 30_000 })

  let content
  if (reviews.isPending) content = <PageSpinner />
  else if (reviews.isError) {
    content = <LoadError message={t('reviews.loadError')} onRetry={() => reviews.refetch()} />
  } else if (reviews.data.length === 0) {
    content = (
      <EmptyState
        icon={MessagesSquare}
        title={t('reviews.emptyTitle')}
        action={
          <ButtonLink to="/dashboard" variant="secondary">
            {t('reviews.goToDashboard')}
          </ButtonLink>
        }
      >
        {t('reviews.emptyBody')}
      </EmptyState>
    )
  } else {
    content = (
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {reviews.data.map((review) => (
          <li key={review.id}>
            <ReviewRow review={review} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <PageHeader title={t('reviews.title')} description={t('reviews.subtitle')} />
      {content}
    </>
  )
}

function ReviewRow({ review }) {
  const { t, i18n } = useTranslation()
  return (
    <Link
      to={`/observations/${review.observation_id}`}
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors outline-none hover:bg-sage-50 focus-visible:bg-sage-50 focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-inset sm:px-5"
    >
      <img src={review.thumb_url} alt="" className="size-14 shrink-0 rounded-lg bg-sage-50 object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink underline-offset-4 group-hover:underline">{review.plant_name}</p>
        <p className="text-sm text-muted">
          {t('reviews.seen', { date: formatDate(review.observed_on, i18n.language) })}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <CaseStatusPill viewer="grower" status={review.status} />
        <RelativeTime value={review.updated_at} template="reviews.updated" className="text-xs text-muted" />
      </div>
    </Link>
  )
}
