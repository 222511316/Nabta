import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { todayISO } from '../../lib/dates'
import { apiPath } from '../../test/api'
import { grower, makeNote, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

function noteStore(initial, log = {}) {
  let notes = initial
  return [
    http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant())),
    http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    http.get(apiPath('/plants/3/notes'), () => HttpResponse.json(notes)),
    http.post(apiPath('/plants/3/notes'), async ({ request }) => {
      log.created = await request.json()
      const note = makeNote({ id: 40, ...log.created })
      notes = [note, ...notes]
      return HttpResponse.json(note, { status: 201 })
    }),
    http.patch(apiPath('/notes/:noteId'), async ({ request, params }) => {
      log.patched = await request.json()
      notes = notes.map((note) => (note.id === Number(params.noteId) ? { ...note, ...log.patched } : note))
      return HttpResponse.json(notes.find((note) => note.id === Number(params.noteId)))
    }),
    http.delete(apiPath('/notes/:noteId'), ({ params }) => {
      log.deleted = Number(params.noteId)
      notes = notes.filter((note) => note.id !== Number(params.noteId))
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}

describe('Personal notes (US19)', () => {
  it('adds a dated note to the plant, dated today unless changed', async () => {
    const log = {}
    server.use(...noteStore([makeNote({ body: 'Moved it into the shade.' })], log))
    const { events } = renderApp('/plants/3?tab=notes', { user: grower })

    expect(await screen.findByText('Moved it into the shade.')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue(todayISO())
    await events.type(screen.getByLabelText('New note'), 'Watered deeply after the heatwave.')
    await events.click(screen.getByRole('button', { name: 'Add note' }))

    expect(await screen.findByText('Watered deeply after the heatwave.')).toBeInTheDocument()
    expect(log.created).toEqual({ noted_on: todayISO(), body: 'Watered deeply after the heatwave.' })
    expect(screen.getByLabelText('New note')).toHaveValue('')
  })

  it('refuses a note dated in the future', async () => {
    const log = {}
    server.use(...noteStore([], log))
    const { events } = renderApp('/plants/3?tab=notes', { user: grower })

    const date = await screen.findByLabelText('Date')
    await events.clear(date)
    await events.type(date, '2999-01-01')
    await events.type(screen.getByLabelText('New note'), 'From the future')
    await events.click(screen.getByRole('button', { name: 'Add note' }))

    expect(await screen.findByText("The date can't be in the future.")).toBeInTheDocument()
    expect(log.created).toBeUndefined()
  })

  it('edits a note in place and deletes one after confirming', async () => {
    const log = {}
    server.use(...noteStore([makeNote({ id: 31, noted_on: '2026-09-21', body: 'Moved it into the shade.' })], log))
    const { events } = renderApp('/plants/3?tab=notes', { user: grower })

    await events.click(await screen.findByRole('button', { name: 'Edit the note from 21 September 2026' }))
    const note = screen.getByLabelText('Note')
    await events.clear(note)
    await events.type(note, 'Moved it into half shade.')
    await events.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Moved it into half shade.')).toBeInTheDocument()
    expect(log.patched).toEqual({ noted_on: '2026-09-21', body: 'Moved it into half shade.' })

    await events.click(screen.getByRole('button', { name: 'Delete the note from 21 September 2026' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete the note from 21 September 2026?' })
    await events.click(within(dialog).getByRole('button', { name: 'Delete note' }))
    expect(await screen.findByText(/Use them for anything you do or notice/)).toBeInTheDocument()
    expect(log.deleted).toBe(31)
  })
})
