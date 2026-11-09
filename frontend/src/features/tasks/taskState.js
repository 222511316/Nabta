import { queryKeys } from '../../api/queryKeys'

export const TASK_GROUPS = ['overdue', 'today', 'upcoming', 'undated', 'done']

/** Where a task stands on `today` (YYYY-MM-DD): one of TASK_GROUPS. */
export function taskState(task, today, done = task.done) {
  if (done) return 'done'
  if (!task.due_on) return 'undated'
  if (task.due_on < today) return 'overdue'
  return task.due_on === today ? 'today' : 'upcoming'
}

/** The API's order (soonest first, then undated, then done) split into TASK_GROUPS. */
export function groupTasks(tasks, today) {
  const groups = Object.fromEntries(TASK_GROUPS.map((group) => [group, []]))
  for (const task of tasks) groups[taskState(task, today)].push(task)
  return groups
}

/** A task change shows up in every list, the dashboard summary, the bell and search. */
export function refreshTaskViews(queryClient) {
  return Promise.all(
    [queryKeys.tasks, queryKeys.summary, queryKeys.notifications, ['search']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}
