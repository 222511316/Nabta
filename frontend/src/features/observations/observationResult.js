import { pestName } from '../../lib/pestName'

/** Nabta's result for a photo, in words: "Aphids" or "Unclear" (null before analysis). */
export function observationResult(t, observation) {
  const analysis = observation.analysis
  if (!analysis) return null
  return analysis.outcome === 'identified' ? pestName(t, analysis.category) : t('observationCard.unclear')
}
