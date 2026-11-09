import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { NotebookPen, Search, SearchX, Sprout } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { queryKeys } from '../../api/queryKeys'
import { searchRecords } from '../../api/search'
import { LoadError, SectionSpinner } from '../../components/ui/feedback'
import { Card, EmptyState, PageHeader } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/dates'
import { pestName } from '../../lib/pestName'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { CaseStatusPill } from '../reviews/CaseStatusPill'
import { TaskRow } from '../tasks/TaskRow'

const TYPES = ['all', 'plants', 'observations', 'tasks', 'notes']
const RESULTS = ['identified', 'unclear', 'review']
const TASK_STATES = ['open', 'done']
const TYPING_PAUSE_MS = 300

/** Wraps each match of `query` in <mark>, ignoring case. */
function highlighter(query) {
  const needle = query.trim()
  if (!needle) return (text) => text
  const pattern = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'giu')
  return (text) =>
    text
      ?.split(pattern)
      .map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-pollen/25 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )
}

/** Finds the grower's plants, photos, tasks and notes (US21). Everything lives in the URL. */
export function SearchPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('search.title'))
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const type = TYPES.includes(searchParams.get('type')) ? searchParams.get('type') : 'all'
  const result = type === 'observations' && RESULTS.includes(searchParams.get('result')) ? searchParams.get('result') : null
  const taskStatus =
    type === 'tasks' && TASK_STATES.includes(searchParams.get('task_status')) ? searchParams.get('task_status') : null
  const [text, setText] = useState(q)

  // Search as the grower types, once they pause.
  useEffect(() => {
    if (text === q) return undefined
    const timer = setTimeout(() => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (text.trim()) next.set('q', text)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, TYPING_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [text, q, setSearchParams])

  const setFilter = (name, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name === 'type') {
      next.delete('result')
      next.delete('task_status')
    }
    setSearchParams(next, { replace: true })
  }

  const params = { q: q.trim() || undefined, type, result: result ?? undefined, task_status: taskStatus ?? undefined }
  const searching = Boolean(params.q || type !== 'all')
  const results = useQuery({
    queryKey: queryKeys.search(params),
    queryFn: () => searchRecords(params),
    enabled: searching,
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('search.title')} description={t('search.subtitle')} />

      <form role="search" onSubmit={(event) => event.preventDefault()} className="space-y-4">
        <label htmlFor="search-input" className="sr-only">
          {t('search.label')}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            id="search-input"
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('search.placeholder')}
            autoFocus
            autoComplete="off"
            className="block w-full rounded-xl border border-line-strong bg-white py-3.5 ps-12 pe-4 text-lg text-ink shadow-card outline-none placeholder:text-muted/70 focus:border-forest-600 focus:ring-3 focus:ring-forest-500/25"
          />
        </div>
        <FilterRow label={t('search.typeLabel')} options={TYPES} value={type} onChange={(v) => setFilter('type', v)} labelFor={(v) => t(`search.types.${v}`)} />
        {type === 'observations' && (
          <FilterRow
            label={t('search.resultLabel')}
            options={[null, ...RESULTS]}
            value={result}
            onChange={(v) => setFilter('result', v)}
            labelFor={(v) => (v ? t(`search.results.${v}`) : t('search.any'))}
          />
        )}
        {type === 'tasks' && (
          <FilterRow
            label={t('search.taskLabel')}
            options={[null, ...TASK_STATES]}
            value={taskStatus}
            onChange={(v) => setFilter('task_status', v)}
            labelFor={(v) => (v ? t(`search.taskStates.${v}`) : t('search.any'))}
          />
        )}
      </form>

      <div className="mt-8" aria-live="polite">
        {!searching ? (
          <p className="text-center text-muted">{t('search.prompt')}</p>
        ) : results.isPending ? (
          <SectionSpinner />
        ) : results.isError ? (
          <LoadError message={errorMessage(t, results.error)} onRetry={() => results.refetch()} />
        ) : (
          <Results data={results.data} highlight={highlighter(q)} query={q.trim()} />
        )}
      </div>
    </div>
  )
}

function FilterRow({ label, options, value, onChange, labelFor }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option ?? 'any'}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cx(
            'min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
            value === option
              ? 'border-forest-700 bg-forest-700 text-white'
              : 'border-line-strong bg-white text-forest-800 hover:border-forest-400 hover:bg-forest-50',
          )}
        >
          {labelFor(option)}
        </button>
      ))}
    </div>
  )
}

function Results({ data, highlight, query }) {
  const { t } = useTranslation()
  const total = data.plants.length + data.observations.length + data.tasks.length + data.notes.length
  if (total === 0) {
    return (
      <EmptyState icon={SearchX} title={query ? t('search.noneFor', { query }) : t('search.none')}>
        {t('search.noneBody')}
      </EmptyState>
    )
  }
  return (
    <div className="space-y-8">
      <p className="sr-only">{t('search.found', { count: total })}</p>
      <ResultSection name="plants" items={data.plants}>
        {(plant) => <PlantHit key={plant.id} plant={plant} highlight={highlight} />}
      </ResultSection>
      <ResultSection name="observations" items={data.observations}>
        {(observation) => <ObservationHit key={observation.id} observation={observation} highlight={highlight} />}
      </ResultSection>
      <ResultSection name="tasks" items={data.tasks}>
        {(task) => <TaskRow key={task.id} task={task} highlight={highlight} />}
      </ResultSection>
      <ResultSection name="notes" items={data.notes}>
        {(note) => <NoteHit key={note.id} note={note} highlight={highlight} />}
      </ResultSection>
    </div>
  )
}

function ResultSection({ name, items, children }) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <section aria-labelledby={`results-${name}`}>
      <h2 id={`results-${name}`} className="mb-3 font-semibold text-forest-800">
        {t(`search.types.${name}`)} <span className="font-normal text-muted">({items.length})</span>
      </h2>
      <Card as="ul" className="divide-y divide-line">
        {items.map(children)}
      </Card>
    </section>
  )
}

const rowLink =
  'flex items-center gap-4 px-4 py-3.5 outline-none hover:bg-sage-50 focus-visible:bg-sage-50 focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-inset sm:px-5'

function PlantHit({ plant, highlight }) {
  const meta = [plant.plant_type, plant.location].filter(Boolean)
  return (
    <li>
      <Link to={`/plants/${plant.id}`} className={rowLink}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-wash text-forest-600">
          <Sprout className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium text-ink">{highlight(plant.name)}</span>
          {meta.length > 0 && <span className="block truncate text-sm text-muted">{highlight(meta.join(', '))}</span>}
        </span>
      </Link>
    </li>
  )
}

function ObservationHit({ observation, highlight }) {
  const { t, i18n } = useTranslation()
  const date = formatDate(observation.observed_on, i18n.language)
  const outcome = observation.result
  return (
    <li>
      <Link to={`/observations/${observation.id}`} className={rowLink}>
        <img
          src={observation.thumb_url}
          alt=""
          loading="lazy"
          className="size-12 shrink-0 rounded-lg bg-sage-50 object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">
            {highlight(observation.plant_name)}, {date}
          </span>
          {outcome && (
            <span className="block text-sm font-medium text-forest-700">
              {outcome.outcome === 'identified' ? highlight(pestName(t, outcome.pest)) : t('observationCard.unclear')}
            </span>
          )}
          {observation.notes && <span className="block truncate text-sm text-muted">{highlight(observation.notes)}</span>}
        </span>
        {observation.review_status && (
          <CaseStatusPill viewer="grower" status={observation.review_status} className="hidden shrink-0 sm:inline-flex" />
        )}
      </Link>
    </li>
  )
}

function NoteHit({ note, highlight }) {
  const { i18n } = useTranslation()
  return (
    <li>
      <Link to={`/plants/${note.plant_id}?tab=notes`} className={rowLink}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-wash text-forest-600">
          <NotebookPen className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium text-ink">
            {highlight(note.plant_name)}, {formatDate(note.noted_on, i18n.language)}
          </span>
          <span className="line-clamp-2 text-sm text-muted">{highlight(note.body)}</span>
        </span>
      </Link>
    </li>
  )
}
