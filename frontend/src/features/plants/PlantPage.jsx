import { Menu, MenuButton, MenuItem, MenuItems, Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Columns2, Ellipsis, ImagePlus, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { listObservations } from '../../api/observations'
import { deletePlant, getPlant } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { LoadError, PageSpinner, SectionSpinner } from '../../components/ui/feedback'
import { Breadcrumb, Card, EmptyState, PageHeader } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatDay } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useAiStatus } from '../ai/useAiStatus'
import { PlantNotes } from '../notes/PlantNotes'
import { ObservationCard } from '../observations/ObservationCard'
import { PlantTasks } from '../tasks/PlantTasks'
import { plantMeta } from './plantMeta'
import { PlantNotFound } from './PlantNotFound'

// The tab is kept in the URL (?tab=tasks), so it survives a refresh, a language switch and a link from a reminder.
const TABS = ['observations', 'tasks', 'notes']

export function PlantPage() {
  const { t } = useTranslation()
  const { plantId } = useParams()
  const plant = useQuery({ queryKey: queryKeys.plant(plantId), queryFn: () => getPlant(plantId) })
  useDocumentTitle(plant.data?.name)

  if (plant.isPending) return <PageSpinner />
  if (plant.isError) {
    return plant.error.code === 'not_found' ? (
      <PlantNotFound />
    ) : (
      <LoadError message={errorMessage(t, plant.error)} onRetry={() => plant.refetch()} />
    )
  }
  return <PlantProfile plant={plant.data} />
}

function PlantProfile({ plant }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const ai = useAiStatus()
  const tabIndex = Math.max(TABS.indexOf(searchParams.get('tab')), 0)

  const remove = useMutation({
    mutationFn: () => deletePlant(plant.id),
    onSuccess: () => {
      // Mark (not remove) the deleted plant's data: removing it while this page is
      // still mounted would make the page fetch it again before navigating away.
      queryClient.invalidateQueries({ queryKey: queryKeys.plant(plant.id), refetchType: 'none' })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants, exact: true })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
      queryClient.invalidateQueries({ queryKey: queryKeys.summary })
      toast.success(t('plant.deleted', { name: plant.name }))
      navigate('/dashboard', { replace: true })
    },
  })

  const deleteBody =
    plant.observation_count === 0
      ? t('plant.deleteBodyEmpty')
      : t('plant.deleteBody', { count: plant.observation_count })

  const details = [
    { label: t('plant.type'), value: plant.plant_type },
    { label: t('plant.location'), value: plant.location },
    { label: t('plant.added'), value: formatDay(plant.created_at, i18n.language) },
  ]

  const selectTab = (index) => {
    const next = new URLSearchParams(searchParams)
    if (index === 0) next.delete('tab')
    else next.set('tab', TABS[index])
    setSearchParams(next, { replace: true })
  }

  // Headless UI moves to the next tab on ArrowRight whatever the direction. In Arabic the tabs run right
  // to left, so the arrow keys are swapped to follow what the user sees (WAI-ARIA tabs pattern; DEF-03).
  const onTabListKeyDown = (event) => {
    if (i18n.dir() !== 'rtl' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    event.stopPropagation()
    const index = (tabIndex + (event.key === 'ArrowLeft' ? 1 : -1) + TABS.length) % TABS.length
    selectTab(index)
    event.currentTarget.querySelectorAll('[role="tab"]')[index]?.focus()
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb items={[{ label: t('nav.dashboard'), to: '/dashboard' }, { label: plant.name }]} />
        }
        title={plant.name}
        description={plantMeta(plant) || null}
        actions={
          <>
            <MoreMenu
              plant={plant}
              aiEnabled={ai.enabled}
              onDelete={() => setConfirmingDelete(true)}
            />
            {plant.observation_count >= 2 && (
              <ButtonLink to={`/plants/${plant.id}/compare`} variant="secondary">
                <Columns2 />
                {t('compare.open')}
              </ButtonLink>
            )}
            <ButtonLink to={`/observations/new?plantId=${plant.id}`}>
              <Camera />
              {t('plant.addObservation')}
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="p-6" aria-labelledby="plant-details-heading">
          <h2 id="plant-details-heading" className="font-semibold text-forest-800">
            {t('plant.details')}
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {value ?? <span className="font-normal text-muted">{t('plant.notSet')}</span>}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-muted">{t('plant.notes')}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-ink">
                {plant.notes ?? <span className="text-muted">{t('plant.noNotes')}</span>}
              </dd>
            </div>
          </dl>
        </Card>

        <TabGroup selectedIndex={tabIndex} onChange={selectTab} className="min-w-0">
          <TabList onKeyDownCapture={onTabListKeyDown} className="mb-6 flex gap-1 border-b border-line">
            {TABS.map((tab) => (
              <Tab
                key={tab}
                className={cx(
                  // No outline-none here: keyboard focus shows the app-wide ring (:focus-visible in
                  // styles/index.css, forest-500), which outline-none used to switch off (DEF-03).
                  '-mb-px flex shrink-0 items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 py-2.5 font-medium text-muted',
                  'hover:text-forest-800',
                  'data-selected:border-forest-700 data-selected:text-forest-800',
                )}
              >
                {t(`plant.tabs.${tab}`)}
                {tab === 'observations' && plant.observation_count > 0 && (
                  <span className="rounded-full bg-sage-100 px-2 text-xs leading-5 text-sage-800 tabular-nums">
                    {plant.observation_count}
                  </span>
                )}
              </Tab>
            ))}
          </TabList>
          {/* The selected panel is in the tab order; it shows the same focus ring when reached. */}
          <TabPanels>
            <TabPanel className="rounded-lg">
              <ObservationHistory plant={plant} />
            </TabPanel>
            <TabPanel className="rounded-lg">
              <PlantTasks plant={plant} />
            </TabPanel>
            <TabPanel className="rounded-lg">
              <PlantNotes plant={plant} />
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => remove.mutate()}
        confirming={remove.isPending}
        title={t('plant.deleteTitle', { name: plant.name })}
        confirmLabel={remove.isPending ? t('plant.deleting') : t('plant.deleteConfirm')}
      >
        {deleteBody}
        {remove.isError && (
          <Alert tone="danger" className="mt-4">
            {errorMessage(t, remove.error)}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  )
}

/** Edit, the AI report and Delete: used less often, so kept one tap away. */
function MoreMenu({ plant, aiEnabled, onDelete }) {
  const { t } = useTranslation()
  const item =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-ink data-focus:bg-forest-50 data-focus:text-forest-800'
  return (
    <Menu>
      <MenuButton className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-white px-4 text-[0.95rem] font-medium text-forest-800 shadow-xs hover:border-forest-400 hover:bg-forest-50 data-open:bg-forest-50">
        <Ellipsis className="size-[1.1em]" />
        {t('plant.more')}
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-40 w-56 rounded-xl border border-line bg-white p-1.5 shadow-raised [--anchor-gap:0.5rem] focus:outline-none"
      >
        <MenuItem>
          <Link to={`/plants/${plant.id}/edit`} className={item}>
            <Pencil className="size-4.5 text-muted" />
            {t('plant.edit')}
          </Link>
        </MenuItem>
        {aiEnabled && (
          <MenuItem>
            <Link to={`/plants/${plant.id}/report`} className={item}>
              <Sparkles className="size-4.5 text-muted" />
              {t('report.open')}
            </Link>
          </MenuItem>
        )}
        <div className="my-1 h-px bg-line" />
        <MenuItem>
          <button type="button" onClick={onDelete} className={cx(item, 'text-danger-600 data-focus:bg-danger-50 data-focus:text-danger-700')}>
            <Trash2 className="size-4.5" />
            {t('plant.delete')}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}

function ObservationHistory({ plant }) {
  const { t } = useTranslation()
  const observations = useQuery({
    queryKey: queryKeys.plantObservations(plant.id),
    queryFn: () => listObservations(plant.id),
  })

  if (observations.isPending) return <SectionSpinner />
  if (observations.isError) {
    return <LoadError message={errorMessage(t, observations.error)} onRetry={() => observations.refetch()} />
  }
  if (observations.data.length === 0) {
    return (
      <EmptyState
        icon={ImagePlus}
        headingLevel="h3"
        title={t('plant.observationsEmptyTitle')}
        action={
          <ButtonLink to={`/observations/new?plantId=${plant.id}`} variant="secondary">
            <Camera />
            {t('plant.addObservation')}
          </ButtonLink>
        }
      >
        {t('plant.observationsEmptyBody')}
      </EmptyState>
    )
  }
  return (
    <ul aria-label={t('plant.observationsTitle')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {observations.data.map((observation, index) => (
        <li key={observation.id} className="animate-rise stagger" style={{ '--i': index }}>
          <ObservationCard observation={observation} />
        </li>
      ))}
    </ul>
  )
}
