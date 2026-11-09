import { apiClient } from './client'

/** The pests Nabta can suggest, each with a summary and its first reference photo. */
export async function listPests() {
  const { data } = await apiClient.get('/pests')
  return data
}

/** One pest's reference page: description, sources, review status and photos (US11). */
export async function getPest(key) {
  const { data } = await apiClient.get(`/pests/${key}`)
  return data
}
