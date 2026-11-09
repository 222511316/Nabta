import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath } from '../../test/api'
import { grower, makePlant } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

// Supervisor review DEF-03: the plant page tabs are real tabs for the keyboard, and nothing on them
// switches off the app-wide focus ring. (jsdom can't draw the ring; e2e/accessibility.spec.js checks it
// in Chromium, Firefox and WebKit.)

function plantHandlers() {
  server.use(
    http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant())),
    http.get(apiPath('/plants/3/observations'), () => HttpResponse.json([])),
    http.get(apiPath('/tasks'), () => HttpResponse.json([])),
    http.get(apiPath('/plants/3/notes'), () => HttpResponse.json([])),
  )
}

describe('Plant page tabs', () => {
  it('are a tab list with one selected tab and a labelled panel', async () => {
    plantHandlers()
    renderApp('/plants/3', { user: grower })

    const list = await screen.findByRole('tablist')
    const tabs = screen.getAllByRole('tab')
    expect(list).toContainElement(tabs[0])
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Observations', 'Tasks', 'Notes'])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0].id)
  })

  it('are reached with Tab and moved between with the arrow keys, Home and End', async () => {
    plantHandlers()
    const { events } = renderApp('/plants/3', { user: grower })
    const [observations, tasks, notes] = await screen.findAllByRole('tab')

    observations.focus()
    await events.keyboard('{ArrowRight}')
    expect(tasks).toHaveFocus()
    expect(tasks).toHaveAttribute('aria-selected', 'true')
    await events.keyboard('{End}')
    expect(notes).toHaveFocus()
    await events.keyboard('{Home}')
    expect(observations).toHaveFocus()
    await events.keyboard('{ArrowLeft}')
    expect(notes).toHaveFocus() // wraps around
  })

  it('follow the reading direction in Arabic: ArrowLeft moves to the next tab', async () => {
    plantHandlers()
    const { events } = renderApp('/plants/3', { user: grower })
    await screen.findByRole('heading', { name: 'Lemon tree' })
    await events.click(screen.getByRole('button', { name: 'العربية' }))
    const [observations, tasks, notes] = await screen.findAllByRole('tab')

    observations.focus()
    await events.keyboard('{ArrowLeft}')
    expect(tasks).toHaveFocus()
    expect(tasks).toHaveAttribute('aria-selected', 'true')
    await events.keyboard('{ArrowLeft}')
    expect(notes).toHaveFocus()
    await events.keyboard('{ArrowRight}')
    expect(tasks).toHaveFocus()
    await events.keyboard('{ArrowRight}')
    expect(observations).toHaveFocus()
    await events.keyboard('{ArrowRight}')
    expect(notes).toHaveFocus() // wraps around
  })

  it('keep the focus ring: no outline-none on a tab or its panel', async () => {
    plantHandlers()
    renderApp('/plants/3', { user: grower })

    for (const tab of await screen.findAllByRole('tab')) expect(tab.className).not.toMatch(/outline-none/)
    expect(screen.getByRole('tabpanel').className).not.toMatch(/outline-none/)
  })
})
