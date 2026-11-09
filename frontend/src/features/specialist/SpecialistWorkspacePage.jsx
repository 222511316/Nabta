import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { queryKeys } from '../../api/queryKeys'
import { listReviewCases } from '../../api/specialist'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { EmptyState, PageHeader } from '../../components/ui/layout'
import { RelativeTime } from '../../components/ui/RelativeTime'
import { formatDate } from '../../lib/dates'
import { formatPercent } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { CaseStatusPill } from '../reviews/CaseStatusPill'

const QUEUE_REFRESH_MS = 30_000

/**
 * The review queue (US14): the specialist's own cases, then the cases nobody has
 * taken yet. It refreshes on its own, so new requests appear without reloading.
 */
export function SpecialistWorkspacePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('specialist.title'))
  const cases = useQuery({
    queryKey: queryKeys.reviewCases,
    queryFn: listReviewCases,
    refetchInterval: QUEUE_REFRESH_MS,
  })

  let content
  if (cases.isPending) content = <PageSpinner />
  else if (cases.isError) {
    content = <LoadError message={t('specialist.loadError')} onRetry={() => cases.refetch()} />
  } else if (cases.data.length === 0) {
    content = (
      <EmptyState icon={Inbox} title={t('specialist.emptyTitle')}>
        {t('specialist.emptyBody')}
      </EmptyState>
    )
  } else {
    const mine = cases.data.filter((item) => item.assigned_to_me)
    const open = cases.data.filter((item) => !item.assigned_to_me)
    content = (
      <div className="space-y-10">
        <QueueSection id="mine" title={t('specialist.mine')} cases={mine} empty={t('specialist.mineEmpty')} />
        <QueueSection id="open" title={t('specialist.open')} cases={open} empty={t('specialist.openEmpty')} />
      </div>
    )
  }

  return (
    <>
      <PageHeader title={t('specialist.title')} description={t('specialist.subtitle')} />
      {content}
    </>
  )
}

function QueueSection({ id, title, cases, empty }) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-semibold text-forest-800">
        {title}
        {cases.length > 0 && <span className="ms-2 text-base font-normal text-muted">({cases.length})</span>}
      </h2>
      {cases.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sage-300 bg-white/60 px-5 py-6 text-sm text-muted">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {cases.map((item) => (
            <li key={item.id}>
              <QueueRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QueueRow({ item }) {
  const { t, i18n } = useTranslation()
  let suggestion
  if (!item.suggestion) suggestion = t('specialist.noSuggestion')
  else if (item.suggestion.outcome === 'unclear') suggestion = t('specialist.suggestionUnclear')
  else {
    suggestion = t('specialist.suggestion', {
      name: item.suggestion.name,
      percent: formatPercent(item.suggestion.confidence, i18n.language),
    })
  }

  return (
    <Link
      to={`/specialist/cases/${item.id}`}
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors outline-none hover:bg-sage-50 focus-visible:bg-sage-50 focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-inset sm:px-5"
    >
      <img src={item.thumb_url} alt="" className="size-16 shrink-0 rounded-lg bg-sage-50 object-cover" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="truncate font-medium text-ink underline-offset-4 group-hover:underline">
            {item.plant_name}
          </span>
          <CaseStatusPill viewer="specialist" status={item.status} assignedToMe={item.assigned_to_me} />
        </p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {t('case.subtitle', { grower: item.grower_name, date: formatDate(item.observed_on, i18n.language) })}
        </p>
        <p className="mt-0.5 truncate text-sm text-ink">{suggestion}</p>
      </div>
      <RelativeTime
        value={item.updated_at}
        template="specialist.updated"
        className="hidden shrink-0 text-xs text-muted sm:block"
      />
    </Link>
  )
}
