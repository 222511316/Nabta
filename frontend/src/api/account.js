import { apiClient } from './client'

export async function updateAccount({ fullName, email }) {
  const { data } = await apiClient.patch('/account', { full_name: fullName, email })
  return data
}

/** US22: whether the Nabta team may use this grower's photos to test the model. */
export async function setResearchConsent(consent) {
  const { data } = await apiClient.patch('/account/consent', { research_consent: consent })
  return data
}

/** US22: deletes the grower's account and everything in it. */
export async function deleteAccount(password) {
  await apiClient.delete('/account', { data: { password } })
}

export async function changePassword({ currentPassword, newPassword }) {
  await apiClient.post('/account/password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
}
