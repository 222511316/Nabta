import { useQuery } from '@tanstack/react-query'
import { Camera, Images, MessageCircleQuestion, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getPest } from '../../api/pests'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { confidenceLevel, formatList, formatPercent } from '../../lib/format'

/**
 * "Nabta's suggestion" on an observation (US09, US10): analysing, identified with its
 * confidence, unclear with next steps, or failed with a way to try again.
 * `onAsk` opens the review request; it's left out once a review exists.
 */
export function AnalysisPanel({ observation, analysis, onAsk }) {
  const { t } = useTranslation()

  return (
    <Card aria-labelledby="analysis-heading" className="p-6">
      <h2 id="analysis-heading" className="flex items-center gap-2 text-sm font-medium text-muted">
        <Search className="size-4 text-forest-600" />
        {t('analysis.title')}
      </h2>
      {analysis.state === 'analysing' && (
        <div role="status" className="mt-3">
          <p className="text-lg font-semibold text-forest-800">{t('analysis.analysing')}</p>
          <p className="mt-1 text-sm text-muted">{t('analysis.analysingBody')}</p>
        </div>
      )}
      {analysis.state === 'failed' && <Failed analysis={analysis} onAsk={onAsk} />}
      {analysis.state === 'done' &&
        (analysis.result.outcome === 'identified' ? (
          <Identified observation={observation} result={analysis.result} onAsk={onAsk} reveal={analysis.revealed} />
        ) : (
          <Unclear observation={observation} result={analysis.result} onAsk={onAsk} reveal={analysis.revealed} />
        ))}
    </Card>
  )
}

const compareLink = (key, observationId) => `/pests/${key}?observation=${observationId}`

function Identified({ observation, result, onAsk, reveal }) {
  const { t, i18n } = useTranslation()
  const pest = useQuery({ queryKey: queryKeys.pest(result.category.key), queryFn: () => getPest(result.category.key) })
  const percent = formatPercent(result.confidence, i18n.language)
  const others = result.predictions
    .slice(1)
    .filter((prediction) => prediction.probability >= 0.01)
    .map((prediction) =>
      t('analysis.withPercent', { name: prediction.name, percent: formatPercent(prediction.probability, i18n.language) }),
    )

  return (
    <div className={reveal ? 'animate-rise' : undefined}>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-forest-800">{result.category.name}</p>
      <div className="mt-3">
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-sage-100">
          <div className="h-full rounded-full bg-forest-600" style={{ width: `${Math.round(result.confidence * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-sm font-medium text-ink">
          {t('analysis.confidence', { level: t(`analysis.levels.${confidenceLevel(result.confidence)}`), percent })}
        </p>
      </div>
      {pest.data && <p className="mt-4 text-sm leading-relaxed text-ink">{pest.data.summary}</p>}

      <div className="mt-5 flex flex-col gap-2">
        <ButtonLink to={compareLink(result.category.key, observation.id)}>
          <Images />
          {t('analysis.compare')}
        </ButtonLink>
        {onAsk && (
          <Button variant="secondary" onClick={onAsk}>
            <MessageCircleQuestion />
            {t('analysis.askSpecialist')}
          </Button>
        )}
      </div>

      {others.length > 0 && (
        <p className="mt-4 text-sm text-muted">{t('analysis.alsoPossible', { list: formatList(others, i18n.language) })}</p>
      )}
      <Footnote result={result} />
    </div>
  )
}

/** Why Nabta can't tell: the insect is unlike its training photos, or no category is likely enough. */
function unclearExplanation(t, result, language) {
  if (result.unclear_reason === 'unfamiliar') {
    // Percentages would mislead here: the model can be sure of a category it has never seen this insect in.
    const [first, second] = result.predictions.map((prediction) => prediction.name)
    return second ? t('analysis.unfamiliarBody', { first, second }) : t('analysis.unfamiliarBodySingle', { first })
  }
  const [first, second] = result.predictions.map((prediction) =>
    t('analysis.withPercent', { name: prediction.name, percent: formatPercent(prediction.probability, language) }),
  )
  return second ? t('analysis.unclearBody', { first, second }) : t('analysis.unclearBodySingle', { first })
}

function Unclear({ observation, result, onAsk, reveal }) {
  const { t, i18n } = useTranslation()
  const closest = result.predictions[0]

  return (
    <div className={reveal ? 'animate-rise' : undefined}>
      <p className="mt-2 text-xl font-semibold tracking-tight text-forest-800">{t('analysis.unclearTitle')}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{unclearExplanation(t, result, i18n.language)}</p>

      <h3 className="mt-6 text-sm font-semibold text-ink">{t('analysis.nextSteps')}</h3>
      <ul className="mt-3 space-y-4">
        <NextStep icon={Camera} title={t('analysis.retakeTitle')} body={t('analysis.retakeBody')}>
          <Link to={`/observations/new?plantId=${observation.plant_id}`} className={linkClasses}>
            {t('analysis.retake')}
          </Link>
        </NextStep>
        <NextStep
          icon={Images}
          title={t('analysis.compareTitle')}
          body={t('analysis.compareBody', { name: closest.name })}
        >
          <Link to={compareLink(closest.key, observation.id)} className={linkClasses}>
            {t('analysis.compareWith', { name: closest.name })}
          </Link>
        </NextStep>
        {onAsk && (
          <NextStep icon={MessageCircleQuestion} title={t('analysis.askTitle')} body={t('analysis.askBody')}>
            <Button size="sm" onClick={onAsk} className="mt-1">
              {t('analysis.askSpecialist')}
            </Button>
          </NextStep>
        )}
      </ul>
      <Footnote result={result} />
    </div>
  )
}

const linkClasses = 'text-sm font-medium text-forest-700 underline underline-offset-4 hover:text-forest-600'

function NextStep({ icon: Icon, title, body, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-forest-700">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-sm text-muted">{body}</p>
        {children}
      </div>
    </li>
  )
}

function Footnote({ result }) {
  const { t } = useTranslation()
  return (
    <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
      {t('analysis.notADiagnosis')} {t('analysis.model', { version: result.model_version })}
    </p>
  )
}

function Failed({ analysis, onAsk }) {
  const { t } = useTranslation()
  const unavailable = analysis.error.code === 'analysis_unavailable'

  return (
    <Alert
      tone={unavailable ? 'warning' : 'danger'}
      title={unavailable ? t('analysis.unavailableTitle') : t('analysis.failedTitle')}
      className="mt-3"
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={analysis.retry}>
            <RefreshCw />
            {t('common.retry')}
          </Button>
          {onAsk && (
            <Button variant="ghost" size="sm" onClick={onAsk}>
              <MessageCircleQuestion />
              {t('analysis.askSpecialist')}
            </Button>
          )}
        </div>
      }
    >
      {unavailable ? t('analysis.unavailableBody') : errorMessage(t, analysis.error)}
    </Alert>
  )
}
