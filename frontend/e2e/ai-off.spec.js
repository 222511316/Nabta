// Supervisor review OBS-06: the assessed release runs without an OpenAI key, so the AI features (plant
// report, "Draft with AI", "Ask about this pest") are switched off. No AI control appears, opening the
// report page directly calls no AI endpoint, and the AI endpoints refuse with 503 ai_unavailable.
import { expect, test } from '@playwright/test'
import { apiPlantWithObservation, apiSignUp, approveSpecialist, evidenceShot, otherPerson } from './support/helpers.js'

const AI_WORDS = /\bAI\b|Plant report|Draft with AI|Ask about/

test('a grower sees no AI feature on the plant, observation and pest pages', async ({ page }, testInfo) => {
  await apiSignUp(page.request)
  const { plant, observation } = await apiPlantWithObservation(page.request)

  expect(await (await page.request.get('/api/ai')).json()).toEqual({ enabled: false, model: null })

  await page.goto(`/plants/${plant.id}`)
  await expect(page.getByRole('heading', { level: 1, name: plant.name })).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Plant report' })).toHaveCount(0)
  await expect(page.getByRole('main').getByText(AI_WORDS)).toHaveCount(0)
  await evidenceShot(page, testInfo, 'FIX3_plant-page-no-ai_en')
  await page.keyboard.press('Escape')

  await page.goto(`/observations/${observation.id}`)
  await expect(page.getByRole('region', { name: "Nabta's suggestion" })).toBeVisible()
  await expect(page.getByRole('main').getByText(AI_WORDS)).toHaveCount(0)

  await page.goto(`/pests/aphids?observation=${observation.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Aphids' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'What you can do' })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Ask about/ })).toHaveCount(0)
  await expect(page.getByLabel('Your question')).toHaveCount(0)
  await expect(page.getByRole('main').getByText(AI_WORDS)).toHaveCount(0)
  await evidenceShot(page, testInfo, 'FIX3_pest-page-no-ai_en')
})

test('the report page, opened directly, calls no AI endpoint', async ({ page }) => {
  await apiSignUp(page.request)
  const { plant } = await apiPlantWithObservation(page.request)
  const aiCalls = []
  page.on('request', (request) => {
    if (/\/api\/plants\/\d+\/report|\/questions$|\/draft$/.test(new URL(request.url()).pathname)) aiCalls.push(request.url())
  })

  await page.goto(`/plants/${plant.id}/report`)

  await expect(page.getByRole('heading', { level: 1, name: "Plant reports aren't available" })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Write report' })).toHaveCount(0)
  expect(aiCalls).toEqual([])
})

test('the AI endpoints refuse without reaching OpenAI', async ({ page }) => {
  await apiSignUp(page.request)
  const { plant } = await apiPlantWithObservation(page.request)

  for (const response of [
    await page.request.post(`/api/plants/${plant.id}/report`),
    await page.request.post('/api/pests/aphids/questions', { data: { question: 'Where do they hide?' } }),
  ]) {
    expect(response.status()).toBe(503)
    expect((await response.json()).code).toBe('ai_unavailable')
  }
})

test('an approved specialist sees no "Draft with AI"', async ({ browser, page }) => {
  const growerPage = await otherPerson(browser, page)
  await apiSignUp(growerPage.request)
  const { observation, plant } = await apiPlantWithObservation(growerPage.request)
  const caseId = (await (await growerPage.request.post(`/api/observations/${observation.id}/review`, { data: {} })).json()).id
  await growerPage.context().close()
  const specialist = await apiSignUp(page.request, { role: 'specialist' })
  approveSpecialist(specialist.email)

  await page.goto(`/specialist/cases/${caseId}`)
  await expect(page.getByRole('heading', { level: 1, name: plant.name })).toBeVisible()
  await page.getByRole('button', { name: 'Take this case' }).click()
  await expect(page.getByRole('region', { name: 'Your assessment' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Draft with AI' })).toHaveCount(0)
  const draft = await page.request.post(`/api/specialist/cases/${caseId}/draft`, { data: {} })
  expect(draft.status()).toBe(503)
  expect((await draft.json()).code).toBe('ai_unavailable')
})
