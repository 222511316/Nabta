import { apiClient } from './client'

export async function updateAccount({ fullName, email }) {
  const { data } = await apiClient.patch('/account', { full_name: fullName, email })
  return data
}

export async function changePassword({ currentPassword, newPassword }) {
  await apiClient.post('/account/password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
}
