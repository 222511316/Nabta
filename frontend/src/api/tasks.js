import { apiClient } from './client'

// Tasks (US18) are sent in the API's snake_case: { title, notes, due_on, observation_id, pest_key }.

/** The grower's tasks: open ones soonest first, then done ones. `status`: 'open' | 'done'. */
export async function listTasks({ status, plantId } = {}) {
  const { data } = await apiClient.get('/tasks', { params: { status, plant_id: plantId } })
  return data
}

export async function createTask(plantId, fields) {
  const { data } = await apiClient.post(`/plants/${plantId}/tasks`, fields)
  return data
}

/** Only the fields given change; `due_on: null` clears the date. */
export async function updateTask(taskId, changes) {
  const { data } = await apiClient.patch(`/tasks/${taskId}`, changes)
  return data
}

export async function deleteTask(taskId) {
  await apiClient.delete(`/tasks/${taskId}`)
}
