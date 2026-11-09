import { BadgeCheck, ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatDay } from '../../lib/dates'
import { pestName } from '../../lib/pestName'

/** The specialist's assessment (US16), always labelled apart from Nabta's suggestion. */
export function AssessmentCard({ feedback, className }) {
  const { t, i18n } = useTranslation()
  const named = pestName(t, feedback.category) ?? feedback.other_pest
  let outcome
  if (feedback.outcome === 'inconclusive') outcome = t('assessment.inconclusive')
  else if (feedback.matches_suggestion) outcome = t('assessment.agrees', { name: named })
  else outcome = t('assessment.identified', { name: named })

  return (
    <section aria-labelledby="assessment-heading" className={className}>
      <div className="rounded-xl border border-forest-200 bg-forest-50/70 p-5">
        <h3 id="assessment-heading" className="flex items-center gap-2 text-sm font-medium text-forest-700">
          <BadgeCheck className="size-4.5" />
          {t('assessment.title')}
        </h3>
        <p className="mt-2 text-lg font-semibold tracking-tight text-forest-800">{outcome}</p>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink">{feedback.message}</p>
        {feedback.category && (
          <Link
            to={`/pests/${feedback.category.key}#guidance`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 underline underline-offset-4 hover:text-forest-600"
          >
            <ListChecks className="size-4 shrink-0" />
            {t('analysis.guidance', { name: named })}
          </Link>
        )}
        <p className="mt-3 text-xs text-muted">
          {t('assessment.by', {
            name: feedback.specialist_name,
            date: formatDay(feedback.created_at, i18n.language),
          })}
        </p>
      </div>
    </section>
  )
}
