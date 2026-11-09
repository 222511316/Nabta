import { apiClient } from './client'

// Plant fields are sent in the API's snake_case: { name, plant_type, location, notes }.

export async function listPlants() {
  const { data } = await apiClient.get('/plants')
  return data
}

export async function getPlant(plantId) {
  const { data } = await apiClient.get(`/plants/${plantId}`)
  return data
}

export async function createPlant(fields) {
  const { data } = await apiClient.post('/plants', fields)
  return data
}

export async function updatePlant(plantId, fields) {
  const { data } = await apiClient.patch(`/plants/${plantId}`, fields)
  return data
}

export async function deletePlant(plantId) {
  await apiClient.delete(`/plants/${plantId}`)
}
