// NFR03 (accessibility) and supervisor review DEF-03: axe-core finds no WCAG 2.1 A or AA problems on the
// core screens, in English and Arabic, at phone and laptop widths; the keyboard reaches the controls and
// each shows a visible focus indicator, including the plant page tabs.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  BASE_URL,
  FOCUS_RING_COLOR,
  PHOTOS,
  apiObservation,
  apiPlantWithObservation,
  apiSignUp,
  approveSpecialist,
  evidenceShot,
  expectVisibleFocusRing,
  isoDay,
} from './support/helpers.js'

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** Safari (WebKit) moves through links and buttons with Option+Tab; plain Tab visits text fields only. */
const tabKey = (browserName) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

// Animations finish at once, so contrast is measured on the settled page.
test.use({ reducedMotion: 'reduce' })

/** Signed-in browsers' cookies and the records the screens show, made once per browser project. */
const people = {}
const records = {}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  const context = () => browser.newContext({ baseURL: BASE_URL })

  const grower = await context()
  await apiSignUp(grower.request, { name: 'Layla Access' })
  const { plant, observation } = await apiPlantWithObservation(grower.request, { notes: 'Green insects.' })
  await apiObservation(grower.request, plant.id, { photo: PHOTOS.aphidsRose, observedOn: isoDay(-5) })
  const review = await grower.request.post(`/api/observations/${observation.id}/review`, { data: { note: 'Please check.' } })
  await grower.request.post(`/api/plants/${plant.id}/tasks`, { data: { title: 'Check under the leaves', due_on: isoDay(2) } })
  await grower.request.post(`/api/plants/${plant.id}/notes`, { data: { noted_on: isoDay(-1), body: 'Watered deeply.' } })
  Object.assign(records, { plant: plant.id, plantName: plant.name, observation: observation.id, case: (await review.json()).id })
  people.grower = await grower.storageState()

  const specialist = await context()
  const account = await apiSignUp(specialist.request, { role: 'specialist', name: 'Dr Faisal Access' })
  approveSpecialist(account.email)
  people.specialist = await specialist.storageState()

  const pending = await context()
  await apiSignUp(pending.request, { role: 'specialist', name: 'Dr Pending Access' })
  people.pending = await pending.storageState()

  for (const c of [grower, specialist, pending]) await c.close()
})

const SCREENS = [
  { name: 'home page', as: null, path: () => '/' },
  { name: 'sign in', as: null, path: () => '/sign-in' },
  { name: 'register', as: null, path: () => '/register' },
  { name: 'dashboard', as: 'grower', path: () => '/dashboard' },
  { name: 'plant: observations', as: 'grower', path: () => `/plants/${records.plant}` },
  { name: 'plant: tasks', as: 'grower', path: () => `/plants/${records.plant}?tab=tasks` },
  { name: 'plant: notes', as: 'grower', path: () => `/plants/${records.plant}?tab=notes` },
  { name: 'observation with review', as: 'grower', path: () => `/observations/${records.observation}` },
  { name: 'new observation', as: 'grower', path: () => `/observations/new?plantId=${records.plant}` },
  { name: 'compare photos', as: 'grower', path: () => `/plants/${records.plant}/compare` },
  { name: 'pest guide', as: 'grower', path: () => '/pests' },
  { name: 'pest page with guidance', as: 'grower', path: () => '/pests/aphids' },
  { name: 'tasks', as: 'grower', path: () => '/tasks' },
  { name: 'reviews', as: 'grower', path: () => '/reviews' },
  { name: 'search results', as: 'grower', path: () => `/search?q=${encodeURIComponent(records.plantName.split(' ').at(-1))}` },
  { name: 'account', as: 'grower', path: () => '/account' },
  { name: 'review queue', as: 'specialist', path: () => '/specialist' },
  { name: 'specialist case', as: 'specialist', path: () => `/specialist/cases/${records.case}` },
  { name: 'awaiting approval', as: 'pending', path: () => '/specialist' },
]

async function open(browser, testInfo, { as, path }, language) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
    baseURL: BASE_URL,
    reducedMotion: 'reduce',
    storageState: as ? people[as] : undefined,
  })
  if (language === 'ar') await context.addInitScript(() => localStorage.setItem('nabta.language', 'ar'))
  const page = await context.newPage()
  await page.goto(path())
  await expect(page.locator('html')).toHaveAttribute('lang', language)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^(Loading…|جارٍ التحميل…)$/ })).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  return page
}

for (const language of ['en', 'ar']) {
  test.describe(`axe-core, WCAG 2.1 A and AA (${language})`, () => {
    for (const screen of SCREENS) {
      test(`${screen.name}`, async ({ browser }, testInfo) => {
        const page = await open(browser, testInfo, screen, language)
        if (language === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

        const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze()

        const problems = results.violations.map(
          (v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        )
        expect(problems, `axe violations on ${screen.name} (${language})`).toEqual([])
        await page.context().close()
      })
    }
  })
}

// The plant page tabs (DEF-03) ---------------------------------------------------------------------

for (const language of ['en', 'ar']) {
  test(`plant page tabs: keyboard reaches each tab and shows the focus ring (${language})`, async ({ browser, browserName }, testInfo) => {
    const page = await open(browser, testInfo, { as: 'grower', path: () => `/plants/${records.plant}` }, language)
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(3)

    // Tab from the top of the page until the keyboard lands on the tab list.
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    for (let presses = 0; presses < 60; presses += 1) {
      await page.keyboard.press(tabKey(browserName))
      if (await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab')) break
    }
    await expectVisibleFocusRing(tabs.nth(0))
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')

    // Arrow keys move along the tabs (the direction follows the language: right to left in Arabic).
    const next = language === 'ar' ? 'ArrowLeft' : 'ArrowRight'
    for (const index of [1, 2]) {
      await page.keyboard.press(next)
      await expectVisibleFocusRing(tabs.nth(index))
      await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true')
    }
    await evidenceShot(page, testInfo, `FIX4_focused-plant-tab_${language}`)

    // Tab moves on into the selected panel (Headless UI gives it tabIndex 0), which shows the same ring.
    await page.keyboard.press(tabKey(browserName))
    await expectVisibleFocusRing(page.getByRole('tabpanel'))

    // Back with Shift+Tab: the selected tab is in the tab order, the others are reached with the arrows.
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await expectVisibleFocusRing(tabs.nth(2))
    await page.keyboard.press('Home')
    await expectVisibleFocusRing(tabs.nth(0))
    await page.context().close()
  })
}

// Every control the keyboard reaches shows a focus indicator ------------------------------------------

/** Describes what shows focus on the active element: its own outline or ring, or a card around it. */
function focusIndicator() {
  const element = document.activeElement
  if (!element || element === document.body) return { ok: true, label: '(body)' }
  const visible = (el) => {
    const style = getComputedStyle(el)
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    const ring = style.boxShadow && style.boxShadow !== 'none'
    return outline || ring
  }
  let ok = visible(element)
  // Card links show the outline on the card (has-[a:focus-visible]); a hidden radio on its label.
  for (let el = element.parentElement, depth = 0; !ok && el && depth < 4; el = el.parentElement, depth += 1) {
    ok = el.matches(':has(:focus-visible)') && visible(el)
  }
  const label = `${element.tagName.toLowerCase()}${element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''} "${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40)}"`
  return { ok, label }
}

const KEYBOARD_SCREENS = [
  { name: 'register', as: null, path: () => '/register' },
  { name: 'dashboard', as: 'grower', path: () => '/dashboard' },
  { name: 'plant page', as: 'grower', path: () => `/plants/${records.plant}` },
  { name: 'observation', as: 'grower', path: () => `/observations/${records.observation}` },
  { name: 'pest page', as: 'grower', path: () => '/pests/aphids' },
  { name: 'review queue', as: 'specialist', path: () => '/specialist' },
]

for (const screen of KEYBOARD_SCREENS) {
  test(`keyboard focus is visible on every stop: ${screen.name}`, async ({ browser, browserName }, testInfo) => {
    const page = await open(browser, testInfo, screen, 'en')
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    const stops = []
    for (let presses = 0; presses < 30; presses += 1) {
      await page.keyboard.press(tabKey(browserName))
      stops.push(await page.evaluate(focusIndicator))
    }
    const reached = stops.filter((stop) => stop.label !== '(body)')
    expect(reached.length, 'the keyboard reaches controls').toBeGreaterThan(3)
    expect(stops.filter((stop) => !stop.ok).map((stop) => stop.label)).toEqual([])
    await page.context().close()
  })
}

test('the focus ring colour is the app-wide token', async ({ browser }, testInfo) => {
  const page = await open(browser, testInfo, { as: null, path: () => '/sign-in' }, 'en')
  const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-forest-500').trim())
  expect(token.toLowerCase()).toBe('#3a714c')
  expect(FOCUS_RING_COLOR).toBe('rgb(58, 113, 76)')
  await page.context().close()
})
