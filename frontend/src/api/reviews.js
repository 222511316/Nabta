import { apiClient } from './client'

/** Sends an observation to the specialists (US12). One review per observation. */
export async function requestReview(observationId, note) {
  const { data } = await apiClient.post(`/observations/${observationId}/review`, { note: note || null })
  return data
}

export async function getReview(observationId) {
  const { data } = await apiClient.get(`/observations/${observationId}/review`)
  return data
}

/** The grower's review cases, most recently updated first (US13). */
export async function listReviews() {
  const { data } = await apiClient.get('/reviews')
  return data
}

/** Answers a specialist's question (US15). */
export async function replyToReview(caseId, body) {
  const { data } = await apiClient.post(`/reviews/${caseId}/replies`, { body })
  return data
}
