import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { analyseObservation } from '../../api/observations'
import { queryKeys } from '../../api/queryKeys'

// The model answers in a fraction of a second; the magnifier's sweep stays on screen at least
// this long so the moment reads as deliberate rather than a flicker. Skipped when motion is
// reduced, and in tests.
const MIN_SWEEP_MS = 1200

function sweepTime() {
  if (import.meta.env.MODE === 'test') return 0
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : MIN_SWEEP_MS
}

async function analyseWithSweep(observationId) {
  const [result] = await Promise.all([
    analyseObservation(observationId),
    new Promise((resolve) => setTimeout(resolve, sweepTime())),
  ])
  return result
}

/**
 * The observation's analysis (US09). An observation without one is analysed as soon
 * as it is shown; the server keeps one result per observation, so a repeat request
 * returns the saved one. Returns one of:
 *   { state: 'analysing' }
 *   { state: 'done', result, revealed }   revealed: the result arrived while watching
 *   { state: 'failed', error, retry }
 */
export function useObservationAnalysis(observation) {
  const queryClient = useQueryClient()
  const [revealed, setRevealed] = useState(false)
  const analyse = useMutation({
    mutationFn: () => analyseWithSweep(observation.id),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.observation(observation.id), (current) =>
        current ? { ...current, analysis: result } : current,
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.plantObservations(observation.plant_id) })
      setRevealed(true)
    },
  })

  // Start once per observation, even when effects run twice in development.
  const { mutate } = analyse
  const startedFor = useRef(null)
  useEffect(() => {
    if (observation.analysis || startedFor.current === observation.id) return
    startedFor.current = observation.id
    mutate()
  }, [observation.analysis, observation.id, mutate])

  if (observation.analysis) return { state: 'done', result: observation.analysis, revealed }
  if (analyse.isError) return { state: 'failed', error: analyse.error, retry: () => mutate() }
  return { state: 'analysing' }
}
