import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Printer, RefreshCw, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { getPlantReport, writePlantReport } from '../../api/ai'
import { getPlant } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LoadError, PageSpinner, SectionSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, EmptyState, PageHeader, StatusPanel } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { formatDate, formatDateTime } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PlantNotFound } from '../plants/PlantNotFound'
import { AiNote } from './AiNote'
import { useAiStatus } from './useAiStatus'

/** An AI-written report on one plant's insect history (US21 summaries). Printable. */
export function PlantReportPage() {
  const { t } = useTranslation()
  const { plantId } = useParams()
  const ai = useAiStatus()
  const plant = useQuery({ queryKey: queryKeys.plant(plantId), queryFn: () => getPlant(plantId) })
  const report = useQuery({
    queryKey: queryKeys.plantReport(plantId),
    queryFn: () => getPlantReport(plantId),
    enabled: ai.enabled, // with AI off, no AI endpoint is called, even when this page is opened directly
  })

  if (plant.isPending) return <PageSpinner />
  if (plant.isError) {
    return plant.error.code === 'not_found' ? (
      <PlantNotFound />
    ) : (
      <LoadError message={errorMessage(t, plant.error)} onRetry={() => plant.refetch()} />
    )
  }
  return <Report plant={plant.data} report={report} ai={ai} />
}

function Report({ plant, report, ai }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  useDocumentTitle(t('report.title', { plant: plant.name }))
  const write = useMutation({
    mutationFn: () => writePlantReport(plant.id),
    onSuccess: (written) => queryClient.setQueryData(queryKeys.plantReport(plant.id), written),
  })
  const hasReport = report.isSuccess
  const missing = report.isError && report.error.code === 'not_found'

  let content
  if (write.isPending) {
    content = (
      <Card className="flex flex-col items-center px-6 py-12 text-center" role="status">
        <Sparkles className="size-7 animate-pulse text-pollen" aria-hidden="true" />
        <p className="mt-4 font-semibold text-forest-800">{t('report.writing')}</p>
        <p className="mt-1 text-sm text-muted">{t('report.writingBody')}</p>
      </Card>
    )
  } else if (!ai.known) {
    content = <SectionSpinner />
  } else if (!ai.enabled) {
    content = (
      <StatusPanel icon={FileText} title={t('report.unavailableTitle')}>
        {t('report.unavailableBody')}
      </StatusPanel>
    )
  } else if (report.isPending) {
    content = <SectionSpinner />
  } else if (hasReport) {
    content = <ReportBody report={report.data} />
  } else if (missing) {
    content = (
      <EmptyState
        icon={FileText}
        title={t('report.emptyTitle')}
        action={
          <Button onClick={() => write.mutate()}>
            <Sparkles />
            {t('report.write')}
          </Button>
        }
      >
        <p>{t('report.emptyBody')}</p>
        <p className="mt-3 text-sm">{t('ai.sentToOpenAi')}</p>
      </EmptyState>
    )
  } else {
    content = <LoadError message={errorMessage(t, report.error)} onRetry={() => report.refetch()} />
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <div className="print:hidden">
            <Breadcrumb
              items={[
                { label: t('nav.dashboard'), to: '/dashboard' },
                { label: plant.name, to: `/plants/${plant.id}` },
                { label: t('report.crumb') },
              ]}
            />
          </div>
        }
        title={t('report.title', { plant: plant.name })}
        description={t('report.subtitle')}
        actions={
          hasReport && (
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer />
                {t('report.print')}
              </Button>
              {ai.enabled && (
                <Button variant="secondary" onClick={() => write.mutate()} loading={write.isPending}>
                  <RefreshCw />
                  {t('report.rewrite')}
                </Button>
              )}
            </div>
          )
        }
      />
      {write.isError && (
        <Alert
          tone="danger"
          title={t('report.failedTitle')}
          className="mb-6"
          action={
            <Button variant="secondary" size="sm" onClick={() => write.mutate()}>
              <RefreshCw />
              {t('common.retry')}
            </Button>
          }
        >
          {errorMessage(t, write.error)}
        </Alert>
      )}
      {content}
    </>
  )
}

function ReportBody({ report }) {
  const { t, i18n } = useTranslation()
  return (
    <article className="animate-fade-in max-w-3xl space-y-8">
      <section aria-labelledby="report-summary">
        <h2 id="report-summary" className="text-lg font-semibold text-forest-800">
          {t('report.summary')}
        </h2>
        <p className="mt-2 text-lg leading-relaxed text-ink">{report.summary}</p>
      </section>

      {report.timeline.length > 0 && (
        <section aria-labelledby="report-timeline">
          <h2 id="report-timeline" className="text-lg font-semibold text-forest-800">
            {t('report.timeline')}
          </h2>
          <ol className="mt-3 space-y-4 border-s-2 border-line ps-5">
            {report.timeline.map((event, index) => (
              <li key={`${event.date}-${index}`} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.7rem] top-1.5 size-3 rounded-full bg-sage-400 ring-4 ring-paper"
                />
                <p className="text-sm font-medium text-muted">{safeDate(event.date, i18n.language)}</p>
                <p className="mt-0.5 leading-relaxed text-ink">{event.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="report-open">
        <h2 id="report-open" className="text-lg font-semibold text-forest-800">
          {t('report.open_items')}
        </h2>
        {report.open_items.length === 0 ? (
          <p className="mt-2 text-muted">{t('report.nothingOpen')}</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1.5 ps-5 text-ink marker:text-sage-500">
            {report.open_items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      {report.next_steps.length > 0 && (
        <section aria-labelledby="report-steps">
          <h2 id="report-steps" className="text-lg font-semibold text-forest-800">
            {t('report.nextSteps')}
          </h2>
          <ul className="mt-3 space-y-3">
            {report.next_steps.map((step) => (
              <li key={step.text} className="rounded-xl border border-line bg-white px-4 py-3 shadow-card">
                <p className="leading-relaxed text-ink">{step.text}</p>
                {step.pest && (
                  <Link
                    to={`/pests/${step.pest.key}`}
                    className="mt-1 inline-block text-sm font-medium text-forest-700 underline underline-offset-4 hover:text-forest-600 print:no-underline"
                  >
                    {t('report.fromGuide', { name: step.pest.name })}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-1 border-t border-line pt-4">
        <p className="text-xs text-muted">{t('report.written', { date: formatDateTime(report.created_at, i18n.language) })}</p>
        <AiNote model={report.model} />
      </footer>
    </article>
  )
}

/** The model writes dates as YYYY-MM-DD; show them like every other date, or as written if not. */
function safeDate(value, language) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value, language) : value
}
