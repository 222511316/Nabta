import { todayISO } from '../lib/dates'
import { apiClient } from './client'

/**
 * Searches the grower's plants, observations, tasks and notes (US21).
 * params: { q, type: 'all'|'plants'|'observations'|'tasks'|'notes', result, task_status }
 */
export async function searchRecords(params) {
  const { data } = await apiClient.get('/search', { params })
  return data
}

/** What needs the grower's attention today, for the dashboard. */
export async function getSummary() {
  const { data } = await apiClient.get('/summary', { params: { today: todayISO() } })
  return data
}
