import { apiClient } from './client'

/** Whether the AI features are set up, and which model writes. */
export async function getAiStatus() {
  const { data } = await apiClient.get('/ai')
  return data
}

/** The plant's latest AI report; 404 (not_found) when none has been written. */
export async function getPlantReport(plantId) {
  const { data } = await apiClient.get(`/plants/${plantId}/report`)
  return data
}

export async function writePlantReport(plantId) {
  const { data } = await apiClient.post(`/plants/${plantId}/report`)
  return data
}

/**
 * An AI draft of the specialist's message, agreeing with their decision so far:
 * { outcome?, categoryKey?, otherPest? }.
 */
export async function draftAssessment(caseId, { outcome, categoryKey, otherPest } = {}) {
  const { data } = await apiClient.post(`/specialist/cases/${caseId}/draft`, {
    outcome: outcome ?? null,
    category_key: categoryKey ?? null,
    other_pest: otherPest ?? null,
  })
  return data
}

/** Asks about a pest; answers come only from its reviewed page. */
export async function askAboutPest(key, question, observationId) {
  const { data } = await apiClient.post(`/pests/${key}/questions`, {
    question,
    observation_id: observationId ? Number(observationId) : null,
  })
  return data
}
