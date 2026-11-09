import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { todayISO } from '../../lib/dates'
import { apiPath } from '../../test/api'
import { grower, makePlant, makeTask } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const daysFromToday = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return todayISO(date)
}

/** A tiny task store, so lists read after a change see it. */
function taskStore(initial, log = {}) {
  let tasks = initial
  return [
    http.get(apiPath('/tasks'), ({ request }) => {
      const plantId = new URL(request.url).searchParams.get('plant_id')
      return HttpResponse.json(plantId ? tasks.filter((task) => String(task.plant_id) === plantId) : tasks)
    }),
    http.post(apiPath('/plants/:plantId/tasks'), async ({ request, params }) => {
      log.created = await request.json()
      log.createdOn = params.plantId
      const task = makeTask({ id: 99, ...log.created, plant_id: Number(params.plantId) })
      tasks = [...tasks, task]
      return HttpResponse.json(task, { status: 201 })
    }),
    http.patch(apiPath('/tasks/:taskId'), async ({ request, params }) => {
      const changes = await request.json()
      log.patched = { id: Number(params.taskId), ...changes }
      tasks = tasks.map((task) =>
        task.id === Number(params.taskId)
          ? { ...task, ...changes, done_at: changes.done ? '2026-10-27T09:00:00Z' : null }
          : task,
      )
      return HttpResponse.json(tasks.find((task) => task.id === Number(params.taskId)))
    }),
    http.delete(apiPath('/tasks/:taskId'), ({ params }) => {
      log.deleted = Number(params.taskId)
      tasks = tasks.filter((task) => task.id !== Number(params.taskId))
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}

describe('Tasks (US18)', () => {
  it('groups tasks by when they are due, with finished ones tucked away', async () => {
    server.use(
      ...taskStore([
        makeTask({ id: 1, title: 'Rinse the leaves', due_on: daysFromToday(-2) }),
        makeTask({ id: 2, title: 'Check the new shoots', due_on: todayISO() }),
        makeTask({ id: 3, title: 'Look for ladybirds', due_on: daysFromToday(5) }),
        makeTask({ id: 4, title: 'Repot the fig' }),
        makeTask({ id: 5, title: 'Prune the dry twigs', done: true, done_at: '2026-10-20T09:00:00Z' }),
      ]),
    )
    const { events } = renderApp('/tasks', { user: grower })

    const overdue = await screen.findByRole('region', { name: 'Overdue (1)' })
    expect(within(overdue).getByText('Rinse the leaves')).toBeInTheDocument()
    expect(within(overdue).getByText(/Was due/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Today (1)' })).getByText('Due today')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Coming up (1)' })).getByText('Look for ladybirds')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'No date (1)' })).getByText('Repot the fig')).toBeInTheDocument()

    expect(screen.queryByText('Prune the dry twigs')).not.toBeInTheDocument()
    await events.click(screen.getByRole('button', { name: 'Done (1)' }))
    expect(screen.getByText('Prune the dry twigs')).toBeInTheDocument()
  })

  it('ticks a task done straight away and can undo it', async () => {
    const log = {}
    server.use(...taskStore([makeTask({ id: 1, title: 'Rinse the leaves', due_on: todayISO() })], log))
    const { events } = renderApp('/tasks', { user: grower })

    await events.click(await screen.findByRole('checkbox', { name: 'Rinse the leaves' }))

    expect(log.patched).toEqual({ id: 1, done: true })
    await events.click(await screen.findByRole('button', { name: 'Done (1)' }))
    const box = await screen.findByRole('checkbox', { name: 'Rinse the leaves' })
    expect(box).toBeChecked()
    await events.click(box)
    await expect.poll(() => log.patched).toEqual({ id: 1, done: false })
    expect(await screen.findByRole('region', { name: 'Today (1)' })).toBeInTheDocument()
  })

  it('adds a task to a chosen plant, with a due date', async () => {
    const log = {}
    server.use(
      ...taskStore([], log),
      http.get(apiPath('/plants'), () =>
        HttpResponse.json([makePlant(), makePlant({ id: 4, name: 'Fig tree' })]),
      ),
    )
    const { events } = renderApp('/tasks', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Add a task' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a task' })
    await events.selectOptions(await within(dialog).findByLabelText('Plant'), 'Fig tree')
    await events.type(within(dialog).getByLabelText('Task'), 'Water at dawn')
    await events.type(within(dialog).getByLabelText(/Due date/), daysFromToday(3))
    await events.click(within(dialog).getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Water at dawn')).toBeInTheDocument()
    expect(log.createdOn).toBe('4')
    expect(log.created).toEqual({
      title: 'Water at dawn',
      due_on: daysFromToday(3),
      notes: null,
      observation_id: null,
      pest_key: null,
    })
  })

  it('needs a title and a plant', async () => {
    server.use(...taskStore([]), http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])))
    const { events } = renderApp('/tasks', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Add a task' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a task' })
    await within(dialog).findByLabelText('Plant')
    await events.click(within(dialog).getByRole('button', { name: 'Add task' }))

    expect(within(dialog).getByText('Choose the plant this task is for.')).toBeInTheDocument()
    expect(within(dialog).getByText('This field is required.')).toBeInTheDocument()
  })

  it('deletes a task only after the grower confirms', async () => {
    const log = {}
    server.use(...taskStore([makeTask({ id: 1, title: 'Rinse the leaves' })], log))
    const { events } = renderApp('/tasks', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Delete task: Rinse the leaves' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this task?' })
    expect(dialog).toHaveTextContent('“Rinse the leaves” and its reminder will be deleted.')
    await events.click(within(dialog).getByRole('button', { name: 'Delete task' }))

    expect(await screen.findByRole('heading', { name: 'No tasks yet' })).toBeInTheDocument()
    expect(log.deleted).toBe(1)
  })

  it("keeps each plant's tasks in a tab on its page, with a quick way to add one", async () => {
    const log = {}
    server.use(
      ...taskStore([makeTask({ id: 1, title: 'Rinse the leaves' })], log),
      http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant())),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    )
    const { events } = renderApp('/plants/3?tab=tasks', { user: grower })

    expect(await screen.findByRole('tab', { name: 'Tasks', selected: true })).toBeInTheDocument()
    expect(await screen.findByText('Rinse the leaves')).toBeInTheDocument()
    await events.type(screen.getByLabelText('New task'), 'Check for ants')
    await events.click(screen.getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Check for ants')).toBeInTheDocument()
    expect(log.createdOn).toBe('3')
    expect(log.created).toEqual({ title: 'Check for ants', due_on: null })
    expect(screen.getByLabelText('New task')).toHaveValue('')
  })
})
