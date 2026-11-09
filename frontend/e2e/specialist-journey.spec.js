// ST-02, the review workflow in the real app: an approved specialist sees the queue, takes a case and
// asks a question; the grower replies; the specialist sends an assessment; the grower sees it.
// Charter FR11-FR15, US12-US16. The specialist is approved with the team's command (supervisor review OBS-14).
import { expect, test } from '@playwright/test'
import {
  PHOTOS,
  apiObservation,
  apiSignUp,
  approveSpecialist,
  evidenceShot,
  otherPerson,
  uniqueName,
} from './support/helpers.js'

test('an approved specialist reviews a case with the grower, from question to assessment', async ({ browser, page }, testInfo) => {
  test.setTimeout(180_000)
  const growerPage = await otherPerson(browser, page)
  const plantName = uniqueName('Fig tree')
  let caseId
  let observationId

  await test.step('a grower asks for a review (set up through the API)', async () => {
    await apiSignUp(growerPage.request, { name: 'Omar Grower' })
    const plant = await (
      await growerPage.request.post('/api/plants', { data: { name: plantName, plant_type: 'Fig', location: 'Courtyard' } })
    ).json()
    const observation = await apiObservation(growerPage.request, plant.id, { photo: PHOTOS.scaleFig, notes: 'Hard bumps on a branch.' })
    observationId = observation.id
    const review = await growerPage.request.post(`/api/observations/${observation.id}/review`, {
      data: { note: 'They do not move. Are they harmful?' },
    })
    caseId = (await review.json()).id
  })

  const specialist = await test.step('an approved specialist sees the queue', async () => {
    const account = await apiSignUp(page.request, { role: 'specialist', name: 'Dr Noura Test' })
    approveSpecialist(account.email)
    await page.goto('/specialist')
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(plantName) })).toBeVisible()
    await evidenceShot(page, testInfo, 'FIX2_approved-specialist-queue_en')
    return account
  })

  await test.step('the specialist takes the case and asks a question', async () => {
    await page.getByRole('link', { name: new RegExp(plantName) }).click()
    await expect(page).toHaveURL(new RegExp(`/specialist/cases/${caseId}$`))
    await expect(page.getByText('They do not move. Are they harmful?')).toBeVisible()
    await page.getByRole('button', { name: 'Take this case' }).click()
    await expect(page.getByRole('region', { name: 'Your assessment' })).toBeVisible()
    await page.getByLabel('Ask the grower a question').fill('Do the bumps come off if you scrape them with a fingernail?')
    await page.getByRole('button', { name: 'Send question' }).click()
    await expect(page.getByRole('region', { name: 'Conversation' }).getByText('Do the bumps come off')).toBeVisible()
  })

  await test.step('the grower is notified and replies', async () => {
    await growerPage.goto('/dashboard')
    await growerPage.getByRole('button', { name: /^Notifications, 1 unread/ }).click()
    await expect(growerPage.getByText(`${specialist.name} asked you a question about ${plantName}`)).toBeVisible()
    await growerPage.goto(`/observations/${observationId}`)
    const review = growerPage.getByRole('region', { name: 'Specialist review' })
    await expect(review.getByText('Do the bumps come off if you scrape them with a fingernail?')).toBeVisible()
    await review.getByLabel('Your reply').fill('Yes, they come off and leave a mark.')
    await review.getByRole('button', { name: 'Send reply' }).click()
    await expect(review.getByText('Yes, they come off and leave a mark.')).toBeVisible()
  })

  await test.step('the specialist sends an assessment', async () => {
    await page.reload()
    const conversation = page.getByRole('region', { name: 'Conversation' })
    await expect(conversation.getByText('Yes, they come off and leave a mark.')).toBeVisible()
    const form = page.getByRole('region', { name: 'Your assessment' })
    await form.getByRole('radio', { name: /^Agree with Nabta/ }).check()
    await form.getByLabel('Message to the grower').fill('These are scale insects. Scrape them off and prune the worst branch.')
    await form.getByRole('button', { name: 'Send assessment' }).click()
    await expect(page.getByText('Assessment sent.')).toBeVisible()
  })

  await test.step('the grower sees the assessment', async () => {
    await growerPage.goto(`/observations/${observationId}`)
    await expect(growerPage.getByText('These are scale insects. Scrape them off and prune the worst branch.')).toBeVisible()
    await expect(growerPage.getByRole('heading', { name: "Specialist's assessment" })).toBeVisible()
    await growerPage.getByRole('button', { name: /^Notifications/ }).click()
    await expect(growerPage.getByText(`${specialist.name} sent an assessment for ${plantName}`)).toBeVisible()
  })

  await growerPage.context().close()
})
