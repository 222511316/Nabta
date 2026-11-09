import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { getObservation } from '../../api/observations'
import { getPest } from '../../api/pests'
import { queryKeys } from '../../api/queryKeys'
import { getReviewCase } from '../../api/specialist'
import { useAuth } from '../../auth/useAuth'
import { ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, PageHeader, StatusPanel } from '../../components/ui/layout'
import { StatusPill } from '../../components/ui/StatusPill'
import { LeafMark } from '../../components/brand/LeafMark'
import { errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { AskAboutPest } from '../ai/AskAboutPest'
import { Guidance } from './Guidance'
import { pestName } from '../../lib/pestName'

/**
 * A pest's reference page (US11). Opened from a result (?observation=) or a case
 * (?case=), it puts the photo being identified beside the reference photos.
 */
export function PestPage() {
  const { t } = useTranslation()
  const { pestKey } = useParams()
  const pest = useQuery({ queryKey: queryKeys.pest(pestKey), queryFn: () => getPest(pestKey) })

  if (pest.isPending) return <PageSpinner />
  if (pest.isError) {
    return pest.error.code === 'not_found' ? (
      <StatusPanel
        icon={SearchX}
        title={t('pests.notFoundTitle')}
        action={<ButtonLink to="/pests">{t('pests.backToGuide')}</ButtonLink>}
      >
        {t('pests.notFoundBody')}
      </StatusPanel>
    ) : (
      <LoadError message={errorMessage(t, pest.error)} onRetry={() => pest.refetch()} />
    )
  }
  return <PestReference pest={pest.data} />
}

/** The photo the grower or specialist is trying to identify, when there is one. */
function useComparisonSubject() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const observationId = user.role === 'grower' ? searchParams.get('observation') : null
  const caseId = user.role === 'specialist' ? searchParams.get('case') : null

  const observation = useQuery({
    queryKey: queryKeys.observation(observationId),
    queryFn: () => getObservation(observationId),
    enabled: Boolean(observationId),
  })
  const reviewCase = useQuery({
    queryKey: queryKeys.reviewCase(caseId),
    queryFn: () => getReviewCase(caseId),
    enabled: Boolean(caseId),
  })

  if (observationId && observation.data) {
    const o = observation.data
    const date = formatDate(o.observed_on, i18n.language)
    return {
      src: o.photo_url,
      alt: t('observation.photoAlt', { plant: o.plant_name, date }),
      label: t('pests.yourPhoto'),
      caption: `${o.plant_name}, ${date}`,
      analysis: o.analysis,
      param: `observation=${o.id}`,
      observationId: o.id,
      observation: o,
      back: { to: `/observations/${o.id}`, label: t('pests.backToObservation') },
      crumbs: [
        { label: t('nav.dashboard'), to: '/dashboard' },
        { label: o.plant_name, to: `/plants/${o.plant_id}` },
        { label: date, to: `/observations/${o.id}` },
      ],
    }
  }
  if (caseId && reviewCase.data) {
    const c = reviewCase.data
    const date = formatDate(c.observation.observed_on, i18n.language)
    return {
      src: c.observation.photo_url,
      alt: t('case.photoAlt', { plant: c.plant.name, date }),
      label: t('pests.growerPhoto'),
      caption: `${c.plant.name}, ${date}`,
      analysis: c.analysis,
      param: `case=${c.id}`,
      back: { to: `/specialist/cases/${c.id}`, label: t('pests.backToCase') },
      crumbs: [
        { label: t('nav.reviewQueue'), to: '/specialist' },
        { label: c.plant.name, to: `/specialist/cases/${c.id}` },
      ],
    }
  }
  return null
}

function PestReference({ pest }) {
  const { t } = useTranslation()
  const subject = useComparisonSubject()
  const { hash } = useLocation()
  useDocumentTitle(pest.name)

  // Opened from "What you can do" on a result: go straight to the guidance.
  useEffect(() => {
    if (hash === '#guidance') document.getElementById('guidance')?.scrollIntoView?.({ block: 'start' })
  }, [hash])

  const crumbs = subject?.crumbs ?? [{ label: t('pests.guideTitle'), to: '/pests' }]
  const facts = [
    { label: t('pests.size'), value: pest.size },
    { label: t('pests.where'), value: pest.where },
    { label: t('pests.damage'), value: pest.damage },
    { label: t('pests.lookAlikes'), value: pest.look_alikes },
  ].filter((fact) => fact.value)

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[...crumbs, { label: pest.name }]} />}
        title={subject ? t('pests.compareTitle', { name: pest.name }) : pest.name}
        description={pest.summary}
        actions={
          subject && (
            <ButtonLink to={subject.back.to} variant="secondary">
              <ArrowLeft className="rtl:rotate-180" />
              {subject.back.label}
            </ButtonLink>
          )
        }
      />

      {subject ? <ComparisonStage subject={subject} pest={pest} /> : <Gallery images={pest.images} />}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section aria-labelledby="look-for-heading">
            <h2 id="look-for-heading" className="text-lg font-semibold text-forest-800">
              {t('pests.lookFor')}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {pest.look_for.map((item) => (
                <li key={item} className="flex gap-3 text-ink">
                  <LeafMark className="mt-1 size-4 shrink-0 text-sage-500" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <dl className="grid gap-x-8 gap-y-5 border-t border-line pt-6 sm:grid-cols-2">
            {facts.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-sm font-semibold text-ink">{label}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line pt-8">
            <Guidance pest={pest} observation={subject?.observation} />
          </div>
        </div>
        <div className="space-y-6">
          <SourceCard pest={pest} />
          <AskAboutPest pest={pest} observationId={subject?.observationId} />
        </div>
      </div>
    </>
  )
}

function ComparisonStage({ subject, pest }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(0)
  const reference = pest.images[selected]
  const alternatives = (subject.analysis?.predictions ?? []).filter((prediction) => prediction.key !== pest.key)

  return (
    <section aria-label={t('pests.compareTitle', { name: pest.name })} className="mb-10">
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <Frame label={subject.label} src={subject.src} alt={subject.alt} caption={subject.caption} />
        <Frame
          key={reference.url}
          label={t('pests.reference')}
          src={reference.url}
          alt={reference.caption}
          caption={reference.caption}
          credit={reference.credit}
          className="animate-fade-in"
        />
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {alternatives.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {t('pests.notAMatch')}
            {alternatives.map((prediction) => (
              <Link
                key={prediction.key}
                to={`/pests/${prediction.key}?${subject.param}`}
                className="rounded-full border border-line-strong bg-white px-3 py-1 font-medium text-forest-800 hover:border-forest-400 hover:bg-forest-50"
              >
                {pestName(t, prediction)}
              </Link>
            ))}
          </p>
        ) : (
          <span />
        )}
        <div role="group" aria-label={t('pests.chooseReference')} className="flex gap-2">
          {pest.images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              aria-pressed={index === selected}
              aria-label={t('pests.showReference', { number: index + 1, caption: image.caption })}
              onClick={() => setSelected(index)}
              className={cx(
                'size-14 overflow-hidden rounded-lg border-2 transition sm:size-16',
                index === selected ? 'border-forest-600' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <img src={image.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Frame({ label, src, alt, caption, credit, className }) {
  return (
    <figure className={cx('min-w-0', className)}>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-sage-50 shadow-card sm:aspect-[4/3]">
        <img src={src} alt={alt} className="size-full object-contain" />
        <span className="absolute start-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-medium text-forest-800 shadow-sm">
          {label}
        </span>
      </div>
      <figcaption className="mt-2 text-sm text-ink">
        {caption}
        {credit && <span className="mt-0.5 block text-xs text-muted">{credit}</span>}
      </figcaption>
    </figure>
  )
}

function Gallery({ images }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="photos-heading" className="mb-10">
      <h2 id="photos-heading" className="sr-only">
        {t('pests.photos')}
      </h2>
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {images.map((image) => (
          <li key={image.url}>
            <figure>
              <div className="aspect-square overflow-hidden rounded-xl border border-line bg-sage-50 shadow-card">
                <img src={image.url} alt={image.caption} loading="lazy" className="size-full object-cover" />
              </div>
              <figcaption className="mt-2 text-sm text-ink">
                {image.caption}
                <span className="mt-0.5 block text-xs text-muted">{image.credit}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SourceCard({ pest }) {
  const { t, i18n } = useTranslation()
  const { review } = pest
  return (
    <Card as="aside" aria-labelledby="sources-heading" className="p-5 text-sm">
      <h2 id="sources-heading" className="font-semibold text-forest-800">
        {t('pests.sources', { count: pest.sources.length })}
      </h2>
      <ul className="mt-2 space-y-2">
        {pest.sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-forest-700 underline underline-offset-4 hover:text-forest-600"
            >
              {source.title}
              <ExternalLink className="size-3.5" />
            </a>
            <span className="block text-muted">{source.publisher}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-line pt-4">
        {review.status === 'reviewed' ? (
          <StatusPill tone="done">
            {t('pests.reviewedBy', { name: review.reviewed_by, date: formatDate(review.reviewed_on, i18n.language) })}
          </StatusPill>
        ) : (
          <StatusPill tone="attention">{t('pests.awaitingReview')}</StatusPill>
        )}
      </div>
      {pest.translation?.status === 'awaiting_review' && (
        <p className="mt-3 text-xs leading-relaxed text-warning-800">{t('pests.translationAwaiting')}</p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">{t('pests.photosNote')}</p>
    </Card>
  )
}
