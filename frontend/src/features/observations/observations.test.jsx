import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, errorResponse, readMultipart } from '../../test/api'
import { grower, makeAnalysis, makeObservation, makePest, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const lemonTree = makePlant({ id: 3, name: 'Lemon tree' })
const tomatoes = makePlant({ id: 4, name: 'Balcony tomatoes', plant_type: 'Tomato' })
const savedObservation = makeObservation({
  id: 7,
  plant_id: 3,
  observed_on: '2026-09-20',
  notes: 'Small green insects under the leaves',
})

const aphidPhoto = () => new File(['fake jpeg bytes'], 'aphids.jpg', { type: 'image/jpeg' })

// Once saved, the observation page asks Nabta to identify the insect.
function plantsAndSavedObservation() {
  return [
    http.get(apiPath('/plants'), () => HttpResponse.json([lemonTree, tomatoes])),
    http.get(apiPath('/observations/7'), () => HttpResponse.json(savedObservation)),
    http.post(apiPath('/observations/7/analysis'), () => HttpResponse.json(makeAnalysis(), { status: 201 })),
    http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
  ]
}

async function setDate(events, value) {
  const input = screen.getByLabelText('Date seen')
  await events.clear(input)
  await events.type(input, value)
}

async function readUpload(request) {
  const form = await readMultipart(request)
  return {
    // jsdom loses the filename in transit, so only the photo's presence is checked.
    hasPhoto: 'photo' in form,
    observedOn: form.observed_on,
    notes: form.notes,
    clientRequestId: form.client_request_id,
  }
}

describe('Saving an observation (US06)', () => {
  it('uploads the photo with its plant, date and notes, then shows the saved observation', async () => {
    let upload
    server.use(
      ...plantsAndSavedObservation(),
      http.post(apiPath('/plants/3/observations'), async ({ request }) => {
        upload = await readUpload(request)
        return HttpResponse.json(savedObservation, { status: 201 })
      }),
    )
    const { events } = renderApp('/observations/new?plantId=3', { user: grower })

    const plant = await screen.findByLabelText('Plant')
    await expect.poll(() => plant.value).toBe('3')
    await events.upload(screen.getByLabelText('Photo'), aphidPhoto())
    expect(await screen.findByRole('img', { name: 'The photo you selected' })).toBeInTheDocument()
    await setDate(events, '2026-09-20')
    await events.type(screen.getByLabelText(/Notes/), 'Small green insects under the leaves')
    await events.click(screen.getByRole('button', { name: 'Save observation' }))

    expect(
      await screen.findByRole('heading', { name: 'Observation from 20 September 2026' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Observation saved.')).toBeInTheDocument()
    expect(upload).toEqual({
      hasPhoto: true,
      observedOn: '2026-09-20',
      notes: 'Small green insects under the leaves',
      clientRequestId: expect.stringMatching(UUID_PATTERN),
    })
  })

  it('turns away a file that is not a JPEG, PNG or WebP before uploading', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([lemonTree])))
    renderApp('/observations/new?plantId=3', { user: grower })
    // The file picker's `accept` filter can be bypassed ("All files", drag and drop).
    const events = userEvent.setup({ applyAccept: false })

    const photo = await screen.findByLabelText('Photo')
    await events.upload(photo, new File(['gif'], 'bug.gif', { type: 'image/gif' }))

    expect(photo).toHaveAccessibleDescription(expect.stringContaining('Use a JPEG, PNG or WebP photo.'))
    expect(screen.queryByRole('img', { name: 'The photo you selected' })).not.toBeInTheDocument()
  })

  it('keeps everything and re-sends the same request id when an upload fails (NFR09)', async () => {
    const requestIds = []
    server.use(
      ...plantsAndSavedObservation(),
      http.post(apiPath('/plants/3/observations'), async ({ request }) => {
        const upload = await readUpload(request)
        requestIds.push(upload.clientRequestId)
        return requestIds.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(savedObservation, { status: 201 })
      }),
    )
    const { events } = renderApp('/observations/new?plantId=3', { user: grower })

    await events.upload(await screen.findByLabelText('Photo'), aphidPhoto())
    await setDate(events, '2026-09-20')
    await events.type(screen.getByLabelText(/Notes/), 'Small green insects under the leaves')
    await events.click(screen.getByRole('button', { name: 'Save observation' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Your observation wasn't saved")
    expect(alert).toHaveTextContent("We couldn't reach Nabta. Check your connection and try again.")
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Small green insects under the leaves')
    expect(screen.getByRole('img', { name: 'The photo you selected' })).toBeInTheDocument()

    await events.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { name: 'Observation from 20 September 2026' }),
    ).toBeInTheDocument()
    expect(requestIds).toHaveLength(2)
    expect(requestIds[1]).toBe(requestIds[0])
  })

  it("shows the server's verdict on the photo next to the photo field", async () => {
    server.use(
      http.get(apiPath('/plants'), () => HttpResponse.json([lemonTree])),
      http.post(apiPath('/plants/3/observations'), () =>
        errorResponse(400, 'image_too_small', { fields: { photo: 'image_too_small' } }),
      ),
    )
    const { events } = renderApp('/observations/new?plantId=3', { user: grower })

    await events.upload(await screen.findByLabelText('Photo'), aphidPhoto())
    await events.click(screen.getByRole('button', { name: 'Save observation' }))

    expect(await screen.findByText(/This photo is too small/)).toBeInTheDocument()
    expect(screen.getByLabelText('Photo')).toHaveAccessibleDescription(
      expect.stringContaining('This photo is too small to show the insect clearly.'),
    )
    // Choosing a different photo is the fix; retrying the same one would not help.
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('does not accept a date in the future', async () => {
    let uploadCalled = false
    server.use(
      http.get(apiPath('/plants'), () => HttpResponse.json([lemonTree])),
      http.post(apiPath('/plants/3/observations'), () => {
        uploadCalled = true
        return HttpResponse.json(savedObservation, { status: 201 })
      }),
    )
    const { events } = renderApp('/observations/new?plantId=3', { user: grower })

    await events.upload(await screen.findByLabelText('Photo'), aphidPhoto())
    await setDate(events, '2099-01-01')
    await events.click(screen.getByRole('button', { name: 'Save observation' }))

    expect(await screen.findByText("The date can't be in the future.")).toBeInTheDocument()
    expect(uploadCalled).toBe(false)
  })

  it('asks the grower to add a plant first when they have none', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([])))
    renderApp('/observations/new', { user: grower })
    const main = await screen.findByRole('main')

    expect(await within(main).findByRole('heading', { name: 'Add a plant first' })).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Add plant' })).toHaveAttribute(
      'href',
      '/plants/new',
    )
  })
})

describe('Viewing an observation (US06, FR10)', () => {
  it('shows the photo with its plant, date and notes', async () => {
    server.use(
      http.get(apiPath('/observations/7'), () =>
        HttpResponse.json({ ...savedObservation, analysis: makeAnalysis() }),
      ),
      http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())),
    )
    renderApp('/observations/7', { user: grower })

    expect(
      await screen.findByRole('heading', { name: 'Observation from 20 September 2026' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Insect photo from Lemon tree, seen 20 September 2026' }),
    ).toHaveAttribute('src', '/api/observations/7/photo')
    for (const link of screen.getAllByRole('link', { name: 'Lemon tree' })) {
      expect(link).toHaveAttribute('href', '/plants/3')
    }
    expect(screen.getByText('Small green insects under the leaves')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open full-size photo/ })).toHaveAttribute(
      'href',
      '/api/observations/7/photo',
    )
  })
})
