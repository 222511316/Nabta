import { apiClient } from './client'

export async function listObservations(plantId) {
  const { data } = await apiClient.get(`/plants/${plantId}/observations`)
  return data
}

export async function getObservation(observationId) {
  const { data } = await apiClient.get(`/observations/${observationId}`)
  return data
}

/**
 * Uploads a photo observation. `clientRequestId` must stay the same across
 * retries of one submission so the server can recognise a repeat.
 * `onProgress` receives the upload percentage (0–100).
 */
export async function createObservation(
  plantId,
  { photo, observedOn, notes, clientRequestId },
  { onProgress } = {},
) {
  const form = new FormData()
  form.append('photo', photo)
  form.append('observed_on', observedOn)
  if (notes) form.append('notes', notes)
  form.append('client_request_id', clientRequestId)

  const { data } = await apiClient.post(`/plants/${plantId}/observations`, form, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100))
    },
  })
  return data
}

/**
 * Runs Nabta's pest model on the observation's photo (US09). The server keeps one
 * analysis per observation, so asking again returns the saved result.
 */
export async function analyseObservation(observationId) {
  const { data } = await apiClient.post(`/observations/${observationId}/analysis`)
  return data
}
