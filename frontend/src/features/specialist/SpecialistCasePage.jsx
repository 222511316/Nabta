import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Hand, Images, Search, SearchX } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { queryKeys } from '../../api/queryKeys'
import { askGrower, claimReviewCase, getReviewCase } from '../../api/specialist'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { TextAreaField } from '../../components/ui/fields'
import { Breadcrumb, Card, PageHeader, StatusPanel } from '../../components/ui/layout'
import { errorMessage, isPendingError } from '../../lib/apiErrors'
import { formatDate } from '../../lib/dates'
import { formatPercent } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { limits, rules } from '../../lib/validation'
import { PhotoStage } from '../analysis/PhotoStage'
import { AssessmentCard } from '../reviews/AssessmentCard'
import { CaseStatusPill } from '../reviews/CaseStatusPill'
import { CaseThread } from '../reviews/CaseThread'
import { AssessmentForm } from './AssessmentForm'
import { AwaitingApproval } from './AwaitingApproval'
import { pestName } from '../../lib/pestName'

const OPEN_CASE_REFRESH_MS = 30_000

/** One review case, as a specialist sees it (US14–US16). */
export function SpecialistCasePage() {
  const { t } = useTranslation()
  const { caseId } = useParams()
  const reviewCase = useQuery({
    queryKey: queryKeys.reviewCase(caseId),
    queryFn: () => getReviewCase(caseId),
    refetchInterval: (query) => (query.state.data?.status === 'answered' ? false : OPEN_CASE_REFRESH_MS),
  })

  if (reviewCase.isPending) return <PageSpinner />
  if (isPendingError(reviewCase.error)) return <AwaitingApproval />
  if (reviewCase.isError) {
    return reviewCase.error.code === 'not_found' ? (
      <StatusPanel
        icon={SearchX}
        title={t('case.notFoundTitle')}
        action={<ButtonLink to="/specialist">{t('case.backToQueue')}</ButtonLink>}
      >
        {t('case.notFoundBody')}
      </StatusPanel>
    ) : (
      <LoadError message={errorMessage(t, reviewCase.error)} onRetry={() => reviewCase.refetch()} />
    )
  }
  return <CaseDetails reviewCase={reviewCase.data} />
}

function CaseDetails({ reviewCase }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const date = formatDate(reviewCase.observation.observed_on, i18n.language)
  useDocumentTitle(reviewCase.plant.name)
  const open = reviewCase.status !== 'answered'
  const mine = reviewCase.assigned_to_me

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[{ label: t('nav.reviewQueue'), to: '/specialist' }, { label: reviewCase.plant.name }]}
          />
        }
        title={reviewCase.plant.name}
        description={t('case.subtitle', { grower: reviewCase.grower_name, date })}
        actions={<CaseStatusPill viewer="specialist" status={reviewCase.status} assignedToMe={mine} />}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <PhotoStage
            src={reviewCase.observation.photo_url}
            alt={t('case.photoAlt', { plant: reviewCase.plant.name, date })}
            width={reviewCase.observation.photo_width}
            height={reviewCase.observation.photo_height}
          />
          <Card aria-labelledby="conversation-heading" className="p-6">
            <h2 id="conversation-heading" className="font-semibold text-forest-800">
              {t('review.conversation')}
            </h2>
            <div className="mt-4">
              <CaseThread
                request={{
                  authorName: reviewCase.grower_name,
                  note: reviewCase.note,
                  createdAt: reviewCase.created_at,
                  label: t('review.request'),
                }}
                messages={reviewCase.messages}
                viewerName={user.full_name}
              />
            </div>
            {mine && reviewCase.status === 'waiting_for_grower' && (
              <p className="mt-5 text-sm text-muted">{t('case.waitingForGrower')}</p>
            )}
            {mine && open && <AskForm reviewCase={reviewCase} />}
          </Card>
        </div>

        <div className="space-y-6">
          {!mine && open && <TakeCase reviewCase={reviewCase} />}
          {mine && open && (
            <Card aria-labelledby="assess-heading" className="p-6">
              <h2 id="assess-heading" className="mb-4 font-semibold text-forest-800">
                {t('case.assessTitle')}
              </h2>
              <AssessmentForm reviewCase={reviewCase} />
            </Card>
          )}
          {reviewCase.feedback && <AssessmentCard feedback={reviewCase.feedback} />}
          <Suggestion reviewCase={reviewCase} />
          <CaseFacts reviewCase={reviewCase} />
        </div>
      </div>
    </>
  )
}

function TakeCase({ reviewCase }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const take = useMutation({
    mutationFn: () => claimReviewCase(reviewCase.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.reviewCase(reviewCase.id), updated)
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewCases, exact: true })
      toast.success(t('case.taken'))
    },
    onError: (error) => {
      if (error.code === 'already_assigned') {
        queryClient.invalidateQueries({ queryKey: queryKeys.reviewCases, exact: true })
        toast.error(errorMessage(t, error))
        navigate('/specialist', { replace: true })
      }
    },
  })

  return (
    <Card aria-labelledby="take-heading" className="p-6">
      <h2 id="take-heading" className="font-semibold text-forest-800">
        {t('case.takeTitle')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t('case.takeBody')}</p>
      {take.isError && take.error.code !== 'already_assigned' && (
        <Alert tone="danger" className="mt-4">
          {errorMessage(t, take.error)}
        </Alert>
      )}
      <Button onClick={() => take.mutate()} loading={take.isPending} className="mt-5 w-full">
        <Hand />
        {take.isPending ? t('case.taking') : t('case.take')}
      </Button>
    </Card>
  )
}

function AskForm({ reviewCase }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const r = rules(t)
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { body: '' } })
  const ask = useMutation({
    mutationFn: ({ body }) => askGrower(reviewCase.id, body.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.reviewCase(reviewCase.id), updated)
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewCases, exact: true })
      toast.success(t('case.questionSent'))
      reset()
    },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => ask.mutate(values))}
      noValidate
      className="mt-6 space-y-3 border-t border-line pt-5"
    >
      <TextAreaField
        label={t('case.ask')}
        hint={t('case.askHint')}
        rows={3}
        error={formState.errors.body?.message}
        {...register('body', r.requiredText(limits.caseMessage))}
      />
      {ask.isError && <Alert tone="danger">{errorMessage(t, ask.error)}</Alert>}
      <Button type="submit" variant="secondary" loading={ask.isPending}>
        {t('case.sendQuestion')}
      </Button>
    </form>
  )
}

/** Nabta's suggestion for the case, read-only, with every prediction the model kept. */
function Suggestion({ reviewCase }) {
  const { t, i18n } = useTranslation()
  const analysis = reviewCase.analysis

  return (
    <Card aria-labelledby="suggestion-heading" className="p-6">
      <h2 id="suggestion-heading" className="flex items-center gap-2 text-sm font-medium text-muted">
        <Search className="size-4 text-forest-600" />
        {t('analysis.title')}
      </h2>
      {!analysis ? (
        <p className="mt-2 text-sm text-muted">{t('specialist.noSuggestion')}</p>
      ) : (
        <>
          <p className="mt-2 text-xl font-semibold tracking-tight text-forest-800">
            {analysis.outcome === 'identified' ? pestName(t, analysis.category) : t('analysis.unclearTitle')}
          </p>
          {analysis.unclear_reason && (
            <p className="mt-1 text-sm text-muted">
              {t(analysis.unclear_reason === 'unfamiliar' ? 'analysis.reasonUnfamiliar' : 'analysis.reasonUncertain')}
            </p>
          )}
          <ul className="mt-4 space-y-2.5">
            {analysis.predictions.map((prediction) => (
              <li key={prediction.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    to={`/pests/${prediction.key}?case=${reviewCase.id}`}
                    className="font-medium text-forest-700 underline-offset-4 hover:underline"
                  >
                    {pestName(t, prediction)}
                  </Link>
                  <span className="text-muted tabular-nums">{formatPercent(prediction.probability, i18n.language)}</span>
                </div>
                <div aria-hidden="true" className="mt-1 h-1 overflow-hidden rounded-full bg-sage-100">
                  <div
                    className="h-full rounded-full bg-forest-500"
                    style={{ width: `${Math.round(prediction.probability * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <ButtonLink
            to={`/pests/${analysis.predictions[0].key}?case=${reviewCase.id}`}
            variant="secondary"
            size="sm"
            className="mt-5"
          >
            <Images />
            {t('case.compare')}
          </ButtonLink>
          <p className="mt-4 text-xs text-muted">{t('analysis.model', { version: analysis.model_version })}</p>
        </>
      )}
    </Card>
  )
}

function CaseFacts({ reviewCase }) {
  const { t } = useTranslation()
  const facts = [
    { label: t('case.plantType'), value: reviewCase.plant.plant_type },
    { label: t('case.location'), value: reviewCase.plant.location },
  ]
  return (
    <Card aria-labelledby="facts-heading" className="p-6">
      <h2 id="facts-heading" className="font-semibold text-forest-800">
        {t('case.details')}
      </h2>
      <dl className="mt-4 space-y-4 text-sm">
        {facts.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {value ?? <span className="font-normal text-muted">{t('case.notSet')}</span>}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-muted">{t('case.growerNotes')}</dt>
          <dd className="mt-0.5 whitespace-pre-line text-ink">
            {reviewCase.observation.notes ?? <span className="text-muted">{t('case.noNotes')}</span>}
          </dd>
        </div>
      </dl>
    </Card>
  )
}
