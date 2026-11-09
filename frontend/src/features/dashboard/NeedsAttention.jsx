import { useQuery } from '@tanstack/react-query'
import { ChevronRight, CircleCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { queryKeys } from '../../api/queryKeys'
import { getSummary } from '../../api/search'
import { cx } from '../../lib/cx'

/**
 * What needs the grower today (US21): overdue and due tasks, reviews waiting on their
 * reply, and unclear results nobody has checked. Each line opens the matching records.
 */
export function NeedsAttention() {
  const { t } = useTranslation()
  const summary = useQuery({ queryKey: queryKeys.summary, queryFn: getSummary })
  if (!summary.data) return null // the plants are the page; this panel never blocks them

  const s = summary.data
  const items = [
    { count: s.tasks_overdue, key: 'overdue', to: '/tasks', accent: 'bg-danger-600' },
    { count: s.tasks_due_today, key: 'dueToday', to: '/tasks', accent: 'bg-pollen' },
    { count: s.reviews_waiting_for_you, key: 'reviews', to: '/reviews', accent: 'bg-forest-600' },
    {
      count: s.unclear_not_reviewed,
      key: 'unclear',
      to: '/search?type=observations&result=unclear',
      accent: 'bg-sage-500',
    },
  ].filter((item) => item.count > 0)

  if (items.length === 0) {
    return (
      <p className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <CircleCheck className="size-4.5 text-forest-600" />
        {t('attention.allClear')}
        {s.open_tasks > 0 && (
          <Link to="/tasks" className="font-medium text-forest-700 underline-offset-4 hover:underline">
            {t('attention.openTasks', { count: s.open_tasks })}
          </Link>
        )}
      </p>
    )
  }

  return (
    <section
      aria-labelledby="attention-heading"
      className="mb-10 rounded-2xl border border-line bg-white p-2 shadow-card sm:flex sm:items-center sm:gap-2"
    >
      <h2 id="attention-heading" className="px-3 pt-2 pb-1 text-sm font-semibold text-forest-800 sm:py-0 sm:whitespace-nowrap">
        {t('attention.title')}
      </h2>
      <ul className="flex flex-col sm:flex-row sm:flex-wrap">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="group flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-ink outline-none hover:bg-sage-50 focus-visible:bg-sage-50 focus-visible:ring-2 focus-visible:ring-forest-500"
            >
              <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', item.accent)} />
              <span>{t(`attention.${item.key}`, { count: item.count })}</span>
              <ChevronRight className="ms-auto size-4 text-muted transition-transform group-hover:translate-x-0.5 sm:ms-0 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
