import { Bug, Eye, ListPlus, MessageCircleQuestion, Scissors, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { Button, ButtonLink } from '../../components/ui/Button'
import { TaskDialog } from '../tasks/TaskDialog'

const KIND_ICONS = { check: Eye, prevent: ShieldCheck, remove: Scissors, natural_enemies: Bug }

/**
 * "What you can do" (US17): practical, non-chemical steps from the same sources as the
 * rest of the page. A grower can turn any step into a task on one of their plants.
 * `observation` is the grower's photo this page was opened from, if any.
 */
export function Guidance({ pest, observation }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [adding, setAdding] = useState(null)
  const isGrower = user.role === 'grower'

  return (
    <section id="guidance" aria-labelledby="guidance-heading" className="scroll-mt-24">
      <h2 id="guidance-heading" className="text-lg font-semibold text-forest-800">
        {t('guidance.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('guidance.intro')}</p>

      <ul className="mt-5 space-y-5">
        {pest.guidance.map((step) => {
          const Icon = KIND_ICONS[step.kind]
          return (
            <li key={step.task} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-wash text-forest-700">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-sage-700">{t(`guidance.kinds.${step.kind}`)}</p>
                <h3 className="mt-0.5 font-medium text-ink">{step.task}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink/85">{step.text}</p>
                {isGrower && (
                  <Button variant="ghost" size="sm" className="mt-1 -ms-3.5" onClick={() => setAdding(step)}>
                    <ListPlus />
                    {t('guidance.addTask')}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3.5 text-sm text-warning-800 sm:flex-row sm:items-center">
        <TriangleAlert className="size-5 shrink-0" />
        <p className="flex-1 leading-relaxed">
          <span className="font-semibold">{t('guidance.pesticidesTitle')}</span> {t('guidance.pesticidesBody')}
        </p>
        {observation && !observation.review_status && (
          <ButtonLink to={`/observations/${observation.id}`} variant="secondary" size="sm">
            <MessageCircleQuestion />
            {t('analysis.askSpecialist')}
          </ButtonLink>
        )}
      </div>

      <TaskDialog
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        defaults={{
          title: adding?.task,
          pestKey: pest.key,
          plantId: observation ? String(observation.plant_id) : undefined,
          observationId: observation?.id,
        }}
      />
    </section>
  )
}
