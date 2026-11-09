import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { queryKeys } from '../../api/queryKeys'
import { createTask, listTasks } from '../../api/tasks'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LoadError, SectionSpinner } from '../../components/ui/feedback'
import { Card } from '../../components/ui/layout'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { todayISO } from '../../lib/dates'
import { limits, rules } from '../../lib/validation'
import { DoneTasks } from './TasksPage'
import { TaskRow } from './TaskRow'
import { refreshTaskViews } from './taskState'

/** The Tasks tab on a plant's page: a quick way to add one, then its open and done tasks. */
export function PlantTasks({ plant }) {
  const { t } = useTranslation()
  const tasks = useQuery({
    queryKey: queryKeys.taskList({ plantId: String(plant.id) }),
    queryFn: () => listTasks({ plantId: plant.id }),
  })
  const open = tasks.data?.filter((task) => !task.done) ?? []
  const done = tasks.data?.filter((task) => task.done) ?? []

  return (
    <div className="space-y-6">
      <QuickAddTask plant={plant} />
      {tasks.isPending ? (
        <SectionSpinner />
      ) : tasks.isError ? (
        <LoadError message={errorMessage(t, tasks.error)} onRetry={() => tasks.refetch()} />
      ) : (
        <>
          {open.length > 0 ? (
            <Card as="ul" className="divide-y divide-line">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} showPlant={false} />
              ))}
            </Card>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-sage-300 bg-white/60 px-5 py-6 text-muted">
              <ListChecks className="size-5 shrink-0 text-sage-600" />
              <p>{done.length > 0 ? t('tasks.allDone') : t('tasks.plantEmpty')}</p>
            </div>
          )}
          {done.length > 0 && <DoneTasks tasks={done} showPlant={false} />}
        </>
      )}
    </div>
  )
}

const inputClasses = (invalid) =>
  cx(
    'block w-full rounded-lg border bg-white px-3.5 py-2.5 text-base text-ink shadow-xs outline-none transition-colors focus:ring-3',
    invalid
      ? 'border-danger-600 focus:ring-danger-600/20'
      : 'border-line-strong hover:border-sage-600 focus:border-forest-600 focus:ring-forest-500/25',
  )

function QuickAddTask({ plant }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const r = rules(t)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors },
  } = useForm({ defaultValues: { title: '', dueOn: '' } })

  const add = useMutation({
    mutationFn: ({ title, dueOn }) => createTask(plant.id, { title: title.trim(), due_on: dueOn || null }),
    onSuccess: () => {
      reset()
      setFocus('title')
      refreshTaskViews(queryClient)
      toast.success(t('tasks.added', { plant: plant.name }))
    },
    onError: (error) => applyFieldErrors(error, setError, t, { title: 'title', due_on: 'dueOn' }),
  })

  const titleError = errors.title?.message
  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => add.mutate(values))}
      aria-label={t('tasks.addTitle')}
      className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="quick-task-title" className="block text-sm font-medium text-ink">
            {t('tasks.newTask')}
          </label>
          <input
            id="quick-task-title"
            placeholder={t('tasks.newTaskPlaceholder')}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? 'quick-task-title-error' : undefined}
            className={inputClasses(titleError)}
            {...register('title', r.requiredText(limits.taskTitle))}
          />
        </div>
        <div className="space-y-1.5 sm:w-44">
          <label htmlFor="quick-task-due" className="block text-sm font-medium text-ink">
            {t('tasks.dueOn')} <span className="font-normal text-muted">({t('common.optional')})</span>
          </label>
          <input id="quick-task-due" type="date" min={todayISO()} className={inputClasses(errors.dueOn)} {...register('dueOn')} />
        </div>
        <Button type="submit" loading={add.isPending}>
          <Plus />
          {t('tasks.add')}
        </Button>
      </div>
      {titleError && (
        <p id="quick-task-title-error" className="mt-1.5 text-sm font-medium text-danger-600">
          {titleError}
        </p>
      )}
      {add.isError && !errors.title && !errors.dueOn && (
        <Alert tone="danger" className="mt-3">
          {errorMessage(t, add.error)}
        </Alert>
      )}
    </form>
  )
}
