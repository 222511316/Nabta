/**
 * The words and tone for a case's status, for whoever is looking at it. The tone is
 * `attention` when it's the viewer's turn to act.
 */
export function caseStatusFor(viewer, status, assignedToMe = false) {
  if (viewer === 'grower') {
    const tone = status === 'waiting_for_grower' ? 'attention' : status === 'answered' ? 'done' : 'neutral'
    return { label: `caseStatus.grower.${status}`, tone }
  }
  if (status === 'waiting_for_specialist') {
    return { label: assignedToMe ? 'caseStatus.specialist.waiting_for_specialist' : 'caseStatus.specialist.new', tone: 'attention' }
  }
  return { label: `caseStatus.specialist.${status}`, tone: status === 'answered' ? 'done' : 'neutral' }
}
