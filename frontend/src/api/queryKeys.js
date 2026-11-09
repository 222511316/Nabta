// TanStack Query cache keys. Ids are strings so a route param ("3") and an
// API id (3) address the same cache entry.
export const queryKeys = {
  me: ['auth', 'me'],
  plants: ['plants'],
  plant: (plantId) => ['plants', String(plantId)],
  plantObservations: (plantId) => ['plants', String(plantId), 'observations'],
  observation: (observationId) => ['observations', String(observationId)],
  reviewCases: ['specialist', 'cases'],
}
