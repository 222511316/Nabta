import { apiClient } from './client'

/** A plant's dated personal notes (US19), newest first. */
export async function listNotes(plantId) {
  const { data } = await apiClient.get(`/plants/${plantId}/notes`)
  return data
}

export async function createNote(plantId, { notedOn, body }) {
  const { data } = await apiClient.post(`/plants/${plantId}/notes`, { noted_on: notedOn, body })
  return data
}

export async function updateNote(noteId, { notedOn, body }) {
  const { data } = await apiClient.patch(`/notes/${noteId}`, { noted_on: notedOn, body })
  return data
}

export async function deleteNote(noteId) {
  await apiClient.delete(`/notes/${noteId}`)
}
