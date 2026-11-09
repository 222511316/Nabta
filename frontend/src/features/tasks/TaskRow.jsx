import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { deleteTask, updateTask } from '../../api/tasks'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatShortDate, todayISO } from '../../lib/dates'
import { pestName } from '../../lib/pestName'
import { TaskDialog } from './TaskDialog'
import { refreshTaskViews, taskState } from './taskState'

const iconButton =
  'flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sage-50 hover:text-forest-800'

/** One task in a list: tick it done (immediately), edit it, or delete it. */
export function TaskRow({ task, showPlant = true, highlight = (text) => text }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // The tick shows the moment it's clicked, and stays until the lists have the change.
  const [ticked, setTicked] = useState(null)

  const toggle = useMutation({
    mutationFn: (done) => updateTask(task.id, { done }),
    onSettled: async () => {
      await refreshTaskViews(queryClient)
      setTicked(null)
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  })
  const remove = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      setDeleting(false)
      toast.success(t('tasks.deleted'))
      refreshTaskViews(queryClient)
    },
  })

  const done = ticked ?? task.done
  const state = taskState(task, todayISO(), done)

  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={done}
          onChange={(event) => {
            setTicked(event.target.checked)
            toggle.mutate(event.target.checked)
          }}
          aria-labelledby={titleId}
          className="peer size-6 cursor-pointer appearance-none rounded-full border-2 border-line-strong bg-white transition-colors checked:border-forest-600 checked:bg-forest-600 hover:border-forest-500"
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute size-3.5 scale-50 text-white opacity-0 transition duration-200 peer-checked:scale-100 peer-checked:opacity-100"
        />
      </span>

      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          className={cx(
            'leading-snug font-medium break-words',
            done ? 'text-muted line-through decoration-sage-400' : 'text-ink',
          )}
        >
          {highlight(task.title)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <DueLabel task={task} state={state} language={i18n.language} />
          {showPlant && (
            <Link
              to={`/plants/${task.plant_id}?tab=tasks`}
              className="text-muted underline-offset-4 hover:text-forest-700 hover:underline"
            >
              {task.plant_name}
            </Link>
          )}
          {task.pest && (
            <Link
              to={`/pests/${task.pest.key}#guidance`}
              className="text-muted underline-offset-4 hover:text-forest-700 hover:underline"
            >
              {t('tasks.fromGuide', { name: pestName(t, task.pest) })}
            </Link>
          )}
        </div>
        {task.notes && <p className="mt-1 text-sm whitespace-pre-line text-muted">{highlight(task.notes)}</p>}
      </div>

      <div className="-me-2 flex shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t('tasks.edit', { title: task.title })}
          className={iconButton}
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setDeleting(true)}
          aria-label={t('tasks.delete', { title: task.title })}
          className={cx(iconButton, 'hover:bg-danger-50 hover:text-danger-600')}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <TaskDialog open={editing} task={task} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        confirming={remove.isPending}
        title={t('tasks.deleteTitle')}
        confirmLabel={t('tasks.deleteConfirm')}
      >
        {t('tasks.deleteBody', { title: task.title })}
        {remove.isError && <span className="mt-3 block text-danger-600">{errorMessage(t, remove.error)}</span>}
      </ConfirmDialog>
    </li>
  )
}

function DueLabel({ task, state, language }) {
  const { t } = useTranslation()
  if (state === 'done') {
    if (!task.done_at) return null
    const date = formatShortDate(todayISO(new Date(task.done_at)), language)
    return <span className="text-muted">{t('tasks.doneOn', { date })}</span>
  }
  if (state === 'undated') return null
  const styles = {
    overdue: 'font-medium text-danger-600',
    today: 'font-medium text-warning-800',
    upcoming: 'text-muted',
  }
  return <span className={styles[state]}>{t(`tasks.due.${state}`, { date: formatShortDate(task.due_on, language) })}</span>
}
