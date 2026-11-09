import { apiClient } from './client'

/** Untaken cases waiting for a specialist, plus the cases this specialist has taken (US14). */
export async function listReviewCases() {
  const { data } = await apiClient.get('/specialist/cases')
  return data
}

export async function getReviewCase(caseId) {
  const { data } = await apiClient.get(`/specialist/cases/${caseId}`)
  return data
}

/** Takes a case: from then on, only this specialist can open it. */
export async function claimReviewCase(caseId) {
  const { data } = await apiClient.post(`/specialist/cases/${caseId}/claim`)
  return data
}

export async function askGrower(caseId, body) {
  const { data } = await apiClient.post(`/specialist/cases/${caseId}/questions`, { body })
  return data
}

/**
 * Sends the specialist's assessment and closes the case (US16).
 * { outcome: 'identified' | 'inconclusive', categoryKey?, otherPest?, message }
 */
export async function sendAssessment(caseId, { outcome, categoryKey, otherPest, message }) {
  const { data } = await apiClient.post(`/specialist/cases/${caseId}/feedback`, {
    outcome,
    category_key: categoryKey ?? null,
    other_pest: otherPest ?? null,
    message,
  })
  return data
}
