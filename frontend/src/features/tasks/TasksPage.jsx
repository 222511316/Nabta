import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ListChecks, ListPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { queryKeys } from '../../api/queryKeys'
import { listTasks } from '../../api/tasks'
import { Button } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { Card, EmptyState, PageHeader } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { todayISO } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { TaskDialog } from './TaskDialog'
import { TaskRow } from './TaskRow'
import { groupTasks } from './taskState'

const OPEN_GROUPS = ['overdue', 'today', 'upcoming', 'undated']

/** Every task across the grower's plants (US18), grouped by when it's due. */
export function TasksPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('tasks.pageTitle'))
  const [adding, setAdding] = useState(false)
  const tasks = useQuery({ queryKey: queryKeys.taskList(), queryFn: () => listTasks() })

  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <ListPlus />
      {t('tasks.addTitle')}
    </Button>
  )

  let content
  if (tasks.isPending) content = <PageSpinner />
  else if (tasks.isError) {
    content = <LoadError message={errorMessage(t, tasks.error)} onRetry={() => tasks.refetch()} />
  } else if (tasks.data.length === 0) {
    content = (
      <EmptyState icon={ListChecks} title={t('tasks.emptyTitle')} action={addButton}>
        {t('tasks.emptyBody')}
      </EmptyState>
    )
  } else {
    const groups = groupTasks(tasks.data, todayISO())
    content = (
      <div className="space-y-8">
        {OPEN_GROUPS.filter((group) => groups[group].length > 0).map((group) => (
          <TaskGroup key={group} group={group} tasks={groups[group]} />
        ))}
        {OPEN_GROUPS.every((group) => groups[group].length === 0) && (
          <p className="rounded-2xl border border-dashed border-sage-300 bg-white/60 px-6 py-8 text-center text-muted">
            {t('tasks.allDone')}
          </p>
        )}
        {groups.done.length > 0 && <DoneTasks tasks={groups.done} />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('tasks.pageTitle')}
        description={t('tasks.pageSubtitle')}
        actions={tasks.data?.length > 0 && addButton}
      />
      {content}
      <TaskDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

const GROUP_ACCENTS = {
  overdue: 'bg-danger-600',
  today: 'bg-pollen',
  upcoming: 'bg-forest-500',
  undated: 'bg-sage-400',
}

function TaskGroup({ group, tasks }) {
  const { t } = useTranslation()
  const headingId = `tasks-${group}`
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 flex items-center gap-2.5 font-semibold text-forest-800">
        <span aria-hidden="true" className={cx('size-2 rounded-full', GROUP_ACCENTS[group])} />
        {t(`tasks.groups.${group}`)}{' '}
        <span className="font-normal text-muted">({tasks.length})</span>
      </h2>
      <Card as="ul" className="divide-y divide-line">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Card>
    </section>
  )
}

/** Finished tasks stay out of the way until asked for. */
export function DoneTasks({ tasks, showPlant = true }) {
  const { t } = useTranslation()
  return (
    <Disclosure as="section">
      <DisclosureButton className="group flex items-center gap-2 rounded-lg py-1 font-semibold text-forest-800 hover:text-forest-600">
        <ChevronDown className="size-4.5 transition-transform group-data-open:rotate-180" />
        {t('tasks.groups.done')}{' '}
        <span className="font-normal text-muted">({tasks.length})</span>
      </DisclosureButton>
      <DisclosurePanel as={Card} className="mt-3">
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} showPlant={showPlant} />
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  )
}
