// Shared steps for the browser tests. Every test makes its own throwaway accounts: the password is
// random, kept in memory for the test, and never written to a file or a log.
import { expect } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { BACKEND_DIR, PORT, teamCommand } from './backend.js'

export const BASE_URL = `http://127.0.0.1:${PORT}`

// Real IP102 test-split photos the project already uses for its demo data (credits in
// backend/content/demo/demo.json). The model never trained on them.
const PHOTOS_DIR = path.join(BACKEND_DIR, 'content', 'demo')
export const PHOTOS = {
  aphidsLemon: path.join(PHOTOS_DIR, 'lemon-aphids.jpg'),
  aphidsRose: path.join(PHOTOS_DIR, 'rose-aphids.jpg'),
  scaleFig: path.join(PHOTOS_DIR, 'fig-scale.jpg'),
  whitefliesTomato: path.join(PHOTOS_DIR, 'tomato-whiteflies.jpg'),
}

export function newPassword() {
  return `e2e-${crypto.randomBytes(12).toString('hex')}`
}

/**
 * Types a password into a field without the value appearing in the test report: Playwright names a
 * fill() step after its value, and reports are kept as evidence. The value is set in the page and an
 * input event is sent, which is what React (react-hook-form) listens to, as with typing.
 */
export async function fillSecret(locator, value) {
  await locator.evaluate((input, text) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    input.focus()
    setValue.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

export function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.com`
}

export function uniqueName(prefix) {
  return `${prefix} ${crypto.randomBytes(3).toString('hex')}`
}

/** The date in the browser's time zone (playwright.config.js: Asia/Riyadh), as YYYY-MM-DD. */
export function isoDay(offsetDays = 0) {
  const day = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(day)
}

/** An account made through the API (fast setup); `request` keeps its session cookie. */
export async function apiSignUp(request, { role = 'grower', name, email } = {}) {
  const account = {
    role,
    name: name ?? uniqueName(role === 'specialist' ? 'Specialist' : 'Grower'),
    email: email ?? uniqueEmail(role),
    password: newPassword(),
  }
  const response = await request.post('/api/auth/register', {
    data: { full_name: account.name, email: account.email, password: account.password, role },
  })
  expect(response.status(), await response.text()).toBe(201)
  return account
}

/** The team approves a specialist from the command line (python -m app.cli approve-specialist). */
export function approveSpecialist(email) {
  const out = teamCommand('approve-specialist', '--email', email)
  expect(out).toContain('Approved specialist')
  return out
}

export function revokeSpecialist(email) {
  return teamCommand('revoke-specialist', '--email', email)
}

/** A plant with an analysed IP102 photo observation, made through the API. */
export async function apiPlantWithObservation(request, { plantName, photo = PHOTOS.aphidsLemon, observedOn, notes } = {}) {
  const plant = await (
    await request.post('/api/plants', {
      data: { name: plantName ?? uniqueName('Lemon tree'), plant_type: 'Lemon', location: 'Back garden' },
    })
  ).json()
  const observation = await apiObservation(request, plant.id, { photo, observedOn, notes })
  return { plant, observation }
}

export async function apiObservation(request, plantId, { photo = PHOTOS.aphidsLemon, observedOn = isoDay(-1), notes } = {}) {
  const multipart = {
    observed_on: observedOn,
    photo: { name: path.basename(photo), mimeType: 'image/jpeg', buffer: fs.readFileSync(photo) },
  }
  if (notes) multipart.notes = notes
  const response = await request.post(`/api/plants/${plantId}/observations`, { multipart })
  expect(response.status(), await response.text()).toBe(201)
  const observation = await response.json()
  const analysed = await request.post(`/api/observations/${observation.id}/analysis`)
  expect(analysed.ok(), await analysed.text()).toBeTruthy()
  return observation
}

/** A second browser for another person (separate cookies), sized like this project's page. */
export async function otherPerson(browser, page) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: page.viewportSize(),
    locale: 'en-GB',
    timezoneId: 'Asia/Riyadh',
  })
  return context.newPage()
}

export function isPhone(testInfo) {
  return testInfo.project.name.endsWith('-phone')
}

export async function switchToArabic(page) {
  await page.getByRole('button', { name: 'العربية' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
}

/**
 * Evidence screenshots for the supervisor-review report, only when NABTA_EVIDENCE_DIR is set and only in
 * Chromium (one picture per screen is enough). Desktop pictures are 1366 × 860; phone pictures 390 wide.
 * Never on a screen that shows a password, token or reset link.
 */
export async function evidenceShot(page, testInfo, name, { fullPage = false } = {}) {
  const dir = process.env.NABTA_EVIDENCE_DIR
  if (!dir || !testInfo.project.name.startsWith('chromium')) return
  fs.mkdirSync(dir, { recursive: true })
  const phone = isPhone(testInfo)
  const before = page.viewportSize()
  if (!phone) await page.setViewportSize({ width: 1366, height: 860 })
  // FIXn_description_en.png; phone pictures: FIXn_description-phone_en.png
  const file = path.join(dir, `${phone ? name.replace(/_(en|ar)$/, '-phone_$1') : name}.png`)
  await page.screenshot({ path: file, fullPage, animations: 'disabled' })
  if (!phone) await page.setViewportSize(before)
}

/** The outline a focused element shows, from its computed style. */
export async function focusRing(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      color: style.outlineColor,
      boxShadow: style.boxShadow,
      focusVisible: element.matches(':focus-visible'),
    }
  })
}

/** forest-500, the app-wide focus ring colour (frontend/src/styles/index.css). */
export const FOCUS_RING_COLOR = 'rgb(58, 113, 76)'

export async function expectVisibleFocusRing(locator) {
  await expect(locator).toBeFocused()
  // Polled: with reduced motion the app gives every property a 0.01 ms transition, so the very first
  // frame after focusing can still show the outline's starting colour.
  await expect
    .poll(() => focusRing(locator), { message: 'a solid 2px forest-500 outline on :focus-visible' })
    .toMatchObject({ focusVisible: true, style: 'solid', color: FOCUS_RING_COLOR })
  expect((await focusRing(locator)).width, 'outline width in px').toBeGreaterThanOrEqual(2)
}
