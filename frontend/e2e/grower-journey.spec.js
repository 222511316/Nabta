// ST-01, the Sprint 3 milestone journey, in the real app: a new grower signs up, records a plant and a
// photo, gets Nabta's identification, asks a specialist, follows the guidance, plans a task with a
// reminder, keeps dated notes, compares two photos, searches, and finds everything again after signing
// out and back in. Charter FR01, FR04-FR11, FR16-FR20, US01-US21.
import { expect, test } from '@playwright/test'
import { PHOTOS, evidenceShot, fillSecret, isoDay, newPassword, uniqueEmail, uniqueName } from './support/helpers.js'

test('a grower records, identifies, asks, plans, notes, compares and finds it all again', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const grower = { name: 'Sara Test', email: uniqueEmail('grower'), password: newPassword() }
  const plantName = uniqueName('Lemon tree')
  const taskTitle = uniqueName('Rinse the new leaves')

  await test.step('sign up as a grower', async () => {
    await page.goto('/register')
    await expect(page.getByRole('radio', { name: /^Grower/ })).toBeChecked()
    await page.getByLabel('Full name').fill(grower.name)
    await page.getByLabel('Email').fill(grower.email)
    await fillSecret(page.getByLabel('Password', { exact: true }), grower.password)
    await fillSecret(page.getByLabel('Confirm password'), grower.password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Your plants' })).toBeVisible()
  })

  await test.step('create a plant', async () => {
    await page.getByRole('link', { name: 'Add plant' }).first().click()
    await page.getByLabel('Plant name').fill(plantName)
    await page.getByLabel(/Type of plant/).fill('Lemon')
    await page.getByLabel(/Location/).fill('Back garden')
    await page.getByRole('button', { name: 'Add plant' }).click()
    await expect(page.getByRole('heading', { level: 1, name: plantName })).toBeVisible()
  })

  const plantUrl = page.url()

  await test.step('upload an insect photo and save the observation', async () => {
    await page.getByRole('link', { name: 'Add observation' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'New observation' })).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles(PHOTOS.aphidsLemon)
    await page.getByLabel(/^Notes/).fill('Small green insects under the young leaves.')
    await page.getByRole('button', { name: 'Save observation' }).click()
    await expect(page).toHaveURL(/\/observations\/\d+$/)
  })

  const observationUrl = page.url()

  await test.step('see the identification with its confidence and model version', async () => {
    const suggestion = page.getByRole('region', { name: "Nabta's suggestion" })
    await expect(suggestion.getByText(/^(Very likely|Likely|Possible), \d+%$/)).toBeVisible({ timeout: 30_000 })
    await expect(suggestion.getByText('Aphids', { exact: true })).toBeVisible()
    await expect(suggestion.getByText(/Model nabta-pest-\S+/)).toBeVisible()
    await evidenceShot(page, testInfo, 'FIX5_grower-identification_en')
  })

  await test.step('ask a specialist to review it', async () => {
    await page.getByRole('button', { name: 'Ask a specialist' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Ask a specialist to review this?' })
    await dialog.getByLabel(/Anything else the specialist should know/).fill('They come back every week.')
    await dialog.getByRole('button', { name: 'Send to a specialist' }).click()
    const review = page.getByRole('region', { name: 'Specialist review' })
    await expect(review.getByText('Waiting for a specialist', { exact: true })).toBeVisible()
    await expect(review.getByText('They come back every week.')).toBeVisible()
  })

  await test.step('open the guidance for the pest', async () => {
    await page.getByRole('link', { name: 'What you can do about Aphids' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Aphids' })).toBeVisible()
    const guidance = page.getByRole('region', { name: 'What you can do' })
    await expect(guidance).toBeVisible()
    await expect(guidance.getByRole('button', { name: 'Add as a task' }).first()).toBeVisible()
    await expect(guidance.getByText('None of them use chemicals.', { exact: false })).toBeVisible()
  })

  await test.step('add a task with a reminder for today', async () => {
    await page.goto(`${plantUrl}?tab=tasks`)
    const form = page.getByRole('form', { name: 'Add a task' })
    await form.getByLabel('New task').fill(taskTitle)
    await form.getByLabel(/Due date/).fill(isoDay(0))
    await form.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('tabpanel', { name: 'Tasks' }).getByText(taskTitle)).toBeVisible()
    // The reminder arrives in the notification bell on the due day.
    await page.reload()
    await page.getByRole('button', { name: /^Notifications/ }).click()
    await expect(page.getByText(`Due: ${taskTitle}, on ${plantName}`)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  await test.step('add a dated note, then edit it', async () => {
    await page.goto(`${plantUrl}?tab=notes`)
    const panel = page.getByRole('tabpanel', { name: 'Notes' })
    await panel.getByLabel('Date').fill(isoDay(-2))
    await panel.getByLabel('New note').fill('Watered deeply after a hot week.')
    await panel.getByRole('button', { name: 'Add note' }).click()
    await expect(panel.getByText('Watered deeply after a hot week.')).toBeVisible()

    await panel.getByRole('button', { name: /^Edit the note from / }).click()
    await panel.getByLabel('Note', { exact: true }).fill('Watered deeply, and rinsed the leaves.')
    await panel.getByRole('button', { name: 'Save note' }).click()
    await expect(panel.getByText('Watered deeply, and rinsed the leaves.')).toBeVisible()
    await expect(panel.getByText('Watered deeply after a hot week.')).toHaveCount(0)
  })

  await test.step('add a second photo and compare the two', async () => {
    await page.goto(plantUrl)
    await page.getByRole('link', { name: 'Add observation' }).first().click()
    await page.locator('input[type="file"]').setInputFiles(PHOTOS.aphidsRose)
    await page.getByLabel('Date seen').fill(isoDay(-6))
    await page.getByRole('button', { name: 'Save observation' }).click()
    await expect(page).toHaveURL(/\/observations\/\d+$/)
    await expect(page.getByRole('region', { name: "Nabta's suggestion" }).getByText(/\d+%/).first()).toBeVisible({
      timeout: 30_000,
    })

    await page.goto(plantUrl)
    await page.getByRole('link', { name: 'Compare photos' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Compare photos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '2 photos over time' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change photo A' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change photo B' })).toBeVisible()
    await expect(page.getByText('6 days apart')).toBeVisible()
  })

  await test.step('search, then filter the results', async () => {
    await page.goto('/search')
    await page.getByRole('searchbox', { name: 'Search your records' }).fill(plantName.split(' ').at(-1))
    await expect(page.getByRole('region', { name: /^Plants/ }).getByRole('link', { name: plantName })).toBeVisible()
    await expect(page.getByRole('region', { name: /^Photos \(2\)/ })).toBeVisible()

    const show = page.getByRole('group', { name: 'Show' })
    await show.getByRole('button', { name: 'Photos' }).click()
    await expect(show.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('region', { name: /^Photos/ })).toBeVisible()
    await expect(page.getByRole('region', { name: /^Plants/ })).toHaveCount(0)

    await page.getByRole('searchbox', { name: 'Search your records' }).fill(taskTitle)
    await show.getByRole('button', { name: 'Tasks' }).click()
    await expect(page.getByRole('region', { name: /^Tasks/ }).getByText(taskTitle)).toBeVisible()
  })

  await test.step('sign out and back in', async () => {
    await page.getByRole('button', { name: `Account menu for ${grower.name}` }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)

    await page.getByLabel('Email').fill(grower.email)
    await fillSecret(page.getByLabel('Password', { exact: true }), grower.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  await test.step('everything is still there', async () => {
    await expect(page.getByRole('link', { name: plantName })).toBeVisible()
    await page.goto(plantUrl)
    await expect(page.getByRole('tab', { name: /Observations\s*2/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Tasks' }).click()
    await expect(page.getByRole('tabpanel', { name: 'Tasks' }).getByText(taskTitle)).toBeVisible()
    await page.getByRole('tab', { name: 'Notes' }).click()
    await expect(page.getByRole('tabpanel', { name: 'Notes' }).getByText('Watered deeply, and rinsed the leaves.')).toBeVisible()
    await page.goto(observationUrl)
    await expect(page.getByRole('region', { name: 'Specialist review' }).getByText('They come back every week.')).toBeVisible()
  })
})
