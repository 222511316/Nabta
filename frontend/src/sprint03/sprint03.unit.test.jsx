// Sprint 03 unit tests (UT-10 to UT-17): interface helpers and components, checked against the
// Project Charter's US17, US18, US20, US21 and US23 (Section 16.3).
// UT-10 to UT-13 call functions directly. UT-14 to UT-17 render one screen of the real app in
// jsdom; every API call is answered by a stub (MSW handler) declared in the test, so no backend runs.
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import i18n, { setLanguage } from '../i18n'
import { daysBetween, todayISO } from '../lib/dates'
import { groupTasks, taskState } from '../features/tasks/taskState'
import { apiPath } from '../test/api'
import { grower, makeAnalysis, makeObservation, makePest, makePlant, makeTask, specialist } from '../test/fixtures'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('UT-10 task grouping by due date (US18, FR17)', () => {
  const today = '2026-11-03'
  it('places a task in overdue, today, upcoming, undated or done at the day boundaries', () => {
    expect(taskState(makeTask({ due_on: '2026-11-02' }), today)).toBe('overdue')
    expect(taskState(makeTask({ due_on: '2026-11-03' }), today)).toBe('today')
    expect(taskState(makeTask({ due_on: '2026-11-04' }), today)).toBe('upcoming')
    expect(taskState(makeTask({ due_on: null }), today)).toBe('undated')
    expect(taskState(makeTask({ due_on: '2026-11-02', done: true }), today)).toBe('done')
  })

  it('splits a list into the five groups without losing a task', () => {
    const tasks = ['2026-10-30', '2026-11-03', '2026-12-01', null].map((due_on, id) => makeTask({ id, due_on }))
    tasks.push(makeTask({ id: 9, due_on: '2026-11-03', done: true }))
    const groups = groupTasks(tasks, today)
    expect(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((t) => t.id)]))).toEqual({
      overdue: [0], today: [1], upcoming: [2], undated: [3], done: [9],
    })
  })
})

describe('UT-11 calendar-day arithmetic for photo comparison (US20, FR19)', () => {
  it('counts whole days between two photo dates, including month and leap-year boundaries', () => {
    expect(daysBetween('2026-09-20', '2026-10-02')).toBe(12)
    expect(daysBetween('2026-11-01', '2026-11-01')).toBe(0)
    expect(daysBetween('2026-11-01', '2026-10-20')).toBe(-12)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  it("uses the viewer's own calendar day for today", () => {
    expect(todayISO(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03')
    expect(todayISO(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('UT-12 language switch and text direction (US23, FR21, NFR04)', () => {
  it('switches the document to Arabic right-to-left and back, and remembers the choice', async () => {
    await setLanguage('ar')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(localStorage.getItem('nabta.language')).toBe('ar')
    expect(i18n.t('nav.tasks')).toBe(ar.nav.tasks)

    await setLanguage('en')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
    expect(localStorage.getItem('nabta.language')).toBe('en')
    expect(i18n.t('nav.tasks')).toBe('Tasks')
  })
})

describe('UT-13 Arabic and English interface text coverage (US23, NFR04, Charter Section 8)', () => {
  // Plural keys differ by language (Arabic has more forms), so compare the base names.
  const base = (key) => key.replace(/_(zero|one|two|few|many|other)$/, '')
  const leaves = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]))

  it('has a non-empty Arabic string for every English string, and none extra', () => {
    const enKeys = new Set(leaves(en).map(([k]) => base(k)))
    const arLeaves = leaves(ar)
    const arKeys = new Set(arLeaves.map(([k]) => base(k)))
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([])
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([])
    expect(arLeaves.filter(([, v]) => typeof v === 'string' && !v.trim())).toEqual([])
    for (const key of ['guidance.title', 'tasks.pageTitle', 'notes.add', 'compare.title', 'search.title', 'account.consentLabel']) {
      expect(i18n.getResource('ar', 'translation', key)).toMatch(/[؀-ۿ]/)
    }
  })
})

describe('UT-14 guidance with sources on the pest page (US17, FR16, NFR14)', () => {
  it('shows each step with its kind, the source link and the review status; growers can add a step as a task', async () => {
    server.use(http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())))
    renderApp('/pests/aphids', { user: grower })

    const guidance = await screen.findByRole('region', { name: 'What you can do' })
    expect(within(guidance).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Check new shoots for aphids', 'Hose aphids off with water', 'Protect ladybirds',
    ])
    expect(within(guidance).getByText('Check')).toBeInTheDocument()
    expect(within(guidance).getAllByRole('button', { name: 'Add as a task' })).toHaveLength(3)
    expect(document.querySelector('a[href="https://ipm.ucanr.edu/home-and-landscape/aphids/"]')).not.toBeNull()
    expect(screen.getAllByText('Awaiting specialist review').length).toBeGreaterThan(0)
  })

  it('does not offer "Add as a task" to a specialist', async () => {
    server.use(http.get(apiPath('/pests/aphids'), () => HttpResponse.json(makePest())))
    renderApp('/pests/aphids', { user: specialist })
    const guidance = await screen.findByRole('region', { name: 'What you can do' })
    expect(within(guidance).queryByRole('button', { name: 'Add as a task' })).toBeNull()
  })
})

describe('UT-15 "Needs attention" summary (US21, FR20)', () => {
  const summary = (counts) =>
    http.get(apiPath('/summary'), () =>
      HttpResponse.json({ tasks_overdue: 0, tasks_due_today: 0, reviews_waiting_for_you: 0, unclear_not_reviewed: 0, open_tasks: 0, ...counts }),
    )

  it('shows each non-zero count as a link to the matching records', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])),
      summary({ tasks_overdue: 1, tasks_due_today: 2, unclear_not_reviewed: 1, open_tasks: 4 }))
    renderApp('/dashboard', { user: grower })
    const panel = await screen.findByRole('region', { name: 'Needs attention' })
    expect(within(panel).getByRole('link', { name: '1 task overdue' })).toHaveAttribute('href', '/tasks')
    expect(within(panel).getByRole('link', { name: '2 tasks due today' })).toHaveAttribute('href', '/tasks')
    expect(within(panel).getByRole('link', { name: '1 unclear result to check' })).toHaveAttribute(
      'href', '/search?type=observations&result=unclear')
    expect(within(panel).queryByText(/waiting for your reply/)).toBeNull()
  })

  it('says nothing needs attention when every count is zero', async () => {
    server.use(http.get(apiPath('/plants'), () => HttpResponse.json([makePlant()])), summary({ open_tasks: 0 }))
    renderApp('/dashboard', { user: grower })
    expect(await screen.findByText('Nothing needs your attention today.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs attention' })).toBeNull()
  })
})

describe('UT-16 search filters and match highlighting (US21, FR20)', () => {
  it('sends the filters from the address to the server and highlights the matching words', async () => {
    let sent
    server.use(
      http.get(apiPath('/search'), ({ request }) => {
        sent = Object.fromEntries(new URL(request.url).searchParams)
        return HttpResponse.json({
          plants: [],
          observations: [{
            id: 7, plant_id: 3, plant_name: 'Lemon tree', observed_on: '2026-10-20', notes: 'Green aphids on shoots',
            thumb_url: '/api/observations/7/photo?variant=thumb', result: { outcome: 'identified', pest: { key: 'aphids', name: 'Aphids' } },
            review_status: null,
          }],
          tasks: [],
          notes: [],
        })
      }),
    )
    renderApp('/search?q=aphid&type=observations&result=identified', { user: grower })
    expect(await screen.findByText('1 result')).toBeInTheDocument()
    expect(sent).toMatchObject({ q: 'aphid', type: 'observations', result: 'identified' })
    const marks = [...document.querySelectorAll('mark')].map((m) => m.textContent.toLowerCase())
    expect(marks).toContain('aphid')
  })
})

describe('UT-17 photo comparison uses only the plant\'s own photos (US20, FR19)', () => {
  it("ignores a photo id from another plant in the address and shows this plant's photos with dates", async () => {
    const own = [
      makeObservation({ id: 9, observed_on: '2026-11-01', analysis: makeAnalysis() }),
      makeObservation({ id: 7, observed_on: '2026-10-20', analysis: makeAnalysis() }),
    ]
    server.use(
      http.get(apiPath('/plants/3'), () => HttpResponse.json(makePlant({ observation_count: 2 }))),
      http.get(apiPath('/plants/3/observations'), () => HttpResponse.json(own)),
    )
    renderApp('/plants/3/compare?a=7&b=99', { user: grower }) // 99 belongs to another plant
    expect(await screen.findByRole('link', { name: '20 October 2026' })).toHaveAttribute('href', '/observations/7')
    expect(screen.getByRole('link', { name: '1 November 2026' })).toHaveAttribute('href', '/observations/9')
    expect(screen.getByText('12 days apart')).toBeInTheDocument()
    expect([...document.querySelectorAll('img')].some((img) => img.getAttribute('src')?.includes('/observations/99'))).toBe(false)
  })
})
