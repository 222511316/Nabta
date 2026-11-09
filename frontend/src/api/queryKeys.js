// TanStack Query cache keys. Ids are strings so a route param ("3") and an
// API id (3) address the same cache entry.
export const queryKeys = {
  me: ['auth', 'me'],
  plants: ['plants'],
  plant: (plantId) => ['plants', String(plantId)],
  plantObservations: (plantId) => ['plants', String(plantId), 'observations'],
  observation: (observationId) => ['observations', String(observationId)],
  observationReview: (observationId) => ['observations', String(observationId), 'review'],
  reviews: ['reviews'],
  pests: ['pests'],
  pest: (key) => ['pests', key],
  reviewCases: ['specialist', 'cases'],
  reviewCase: (caseId) => ['specialist', 'cases', String(caseId)],
  notifications: ['notifications'],
  aiStatus: ['ai'],
  plantReport: (plantId) => ['plants', String(plantId), 'report'],
  plantNotes: (plantId) => ['plants', String(plantId), 'notes'],
  // Every task list starts with 'tasks', so one invalidation refreshes them all.
  tasks: ['tasks'],
  taskList: (filters = {}) => ['tasks', filters],
  search: (params) => ['search', params],
  summary: ['summary'],
}
