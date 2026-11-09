// Supervisor review OBS-14 (charter FR03, FR12, NFR05, NFR06): a specialist who signs up on the website
// waits for the Nabta team's approval. They see "Awaiting approval" instead of the queue, the server
// refuses them every case, and once the team approves them (python -m app.cli approve-specialist) the
// queue appears. Revoking the approval hides it again.
import { expect, test } from '@playwright/test'
import {
  apiPlantWithObservation,
  apiSignUp,
  approveSpecialist,
  evidenceShot,
  fillSecret,
  newPassword,
  otherPerson,
  revokeSpecialist,
  switchToArabic,
  uniqueEmail,
} from './support/helpers.js'

const SIGN_UP_MESSAGE =
  'Your specialist account was created. The Nabta team must approve it before you can see review cases.'
const SIGN_UP_MESSAGE_AR =
  'تم إنشاء حساب الأخصائي الخاص بك. يجب أن يوافق فريق نبتة عليه قبل أن تتمكن من رؤية حالات المراجعة.'

/** The radio is visually hidden behind its card-like label, so choose it the way a person does. */
async function chooseSpecialistRole(page, arabic = false) {
  const radio = page.getByRole('radio', { name: arabic ? /^أخصائي نباتات/ : /^Plant specialist/ })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

async function signUpAsSpecialist(page, { email, password, arabic = false }) {
  await page.goto('/register')
  if (arabic) await switchToArabic(page)
  await chooseSpecialistRole(page, arabic)
  await page.getByLabel(arabic ? 'الاسم الكامل' : 'Full name').fill('Dr Huda Test')
  await page.getByLabel(arabic ? 'البريد الإلكتروني' : 'Email').fill(email)
  await fillSecret(page.getByLabel(arabic ? 'كلمة المرور' : 'Password', { exact: true }), password)
  await fillSecret(page.getByLabel(arabic ? 'تأكيد كلمة المرور' : 'Confirm password'), password)
  await page.getByRole('button', { name: arabic ? 'إنشاء الحساب' : 'Create account' }).click()
}

test('a specialist who signs up waits for approval, then sees the queue', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('pending-specialist')

  // A grower's case waiting for a specialist: what a pending specialist must not see.
  const growerPage = await otherPerson(browser, page)
  await apiSignUp(growerPage.request)
  const { plant, observation } = await apiPlantWithObservation(growerPage.request)
  const caseId = (await (await growerPage.request.post(`/api/observations/${observation.id}/review`, { data: {} })).json()).id
  await growerPage.context().close()

  await test.step('register on the website as a plant specialist', async () => {
    await page.goto('/register')
    await chooseSpecialistRole(page)
    await expect(page.getByText(/Specialist accounts are approved by the Nabta team/)).toBeVisible()
    await signUpAsSpecialist(page, { email, password: newPassword() })
    await expect(page.getByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeVisible()
    await expect(page.getByText(SIGN_UP_MESSAGE).first()).toBeVisible()
    await evidenceShot(page, testInfo, 'FIX2_specialist-signup-message_en')
  })

  await test.step('the review queue is not visible, and the server refuses the cases', async () => {
    await page.goto('/specialist')
    await expect(page.getByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review queue' })).toHaveCount(0)
    await expect(page.getByText(plant.name)).toHaveCount(0)
    await evidenceShot(page, testInfo, 'FIX2_pending-approval-panel_en')

    for (const path of ['/api/specialist/cases', `/api/specialist/cases/${caseId}`, `/api/specialist/cases/${caseId}/photo`]) {
      const response = await page.request.get(path)
      expect(response.status(), path).toBe(403)
      expect((await response.json()).code).toBe('specialist_pending')
    }
    const claim = await page.request.post(`/api/specialist/cases/${caseId}/claim`)
    expect(claim.status()).toBe(403)

    await page.goto(`/specialist/cases/${caseId}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeVisible()
    await page.goto('/account')
    await expect(page.getByText('Awaiting approval by the Nabta team')).toBeVisible()
  })

  await test.step('the team approves the account; after a reload the queue appears', async () => {
    approveSpecialist(email)
    await page.goto('/specialist')
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(plant.name) })).toBeVisible()
    expect((await page.request.get(`/api/specialist/cases/${caseId}`)).status()).toBe(200)
  })

  await test.step('revoking the approval hides the queue again', async () => {
    expect(revokeSpecialist(email)).toContain('pending again')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Awaiting approval' })).toBeVisible()
    expect((await page.request.get('/api/specialist/cases')).status()).toBe(403)
  })
})

test('the sign-up message and the waiting panel in Arabic', async ({ page }, testInfo) => {
  await signUpAsSpecialist(page, { email: uniqueEmail('pending-ar'), password: newPassword(), arabic: true })

  await expect(page.getByRole('heading', { level: 1, name: 'بانتظار الموافقة' })).toBeVisible()
  await expect(page.getByText(SIGN_UP_MESSAGE_AR).first()).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await evidenceShot(page, testInfo, 'FIX2_specialist-signup-message_ar')
  await page.goto('/specialist')
  await expect(page.getByRole('heading', { level: 1, name: 'بانتظار الموافقة' })).toBeVisible()
  await evidenceShot(page, testInfo, 'FIX2_pending-approval-panel_ar')
})
