import { ApiError, apiClient } from './client'

/** The signed-in user, or null when nobody is signed in. */
export async function fetchCurrentUser() {
  try {
    const { data } = await apiClient.get('/auth/me')
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/** `role` is the workspace chosen on the sign-in screen; the server refuses a mismatch. */
export async function signIn({ email, password, role }) {
  const { data } = await apiClient.post('/auth/login', { email, password, role })
  return data
}

export async function register({ fullName, email, password, role = 'grower' }) {
  const { data } = await apiClient.post('/auth/register', {
    full_name: fullName,
    email,
    password,
    role,
  })
  return data
}

export async function signOut() {
  await apiClient.post('/auth/logout')
}

export async function requestPasswordReset({ email }) {
  await apiClient.post('/auth/password-reset/request', { email })
}

export async function confirmPasswordReset({ token, newPassword }) {
  await apiClient.post('/auth/password-reset/confirm', { token, new_password: newPassword })
}
