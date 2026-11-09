import { apiClient } from './client'

/** Review cases waiting for a specialist. Always empty until Sprint 2 adds review requests. */
export async function listReviewCases() {
  const { data } = await apiClient.get('/specialist/cases')
  return data
}
