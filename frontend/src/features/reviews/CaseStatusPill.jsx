import { useTranslation } from 'react-i18next'
import { StatusPill } from '../../components/ui/StatusPill'
import { caseStatusFor } from './caseStatus'

export function CaseStatusPill({ viewer, status, assignedToMe, className }) {
  const { t } = useTranslation()
  const { label, tone } = caseStatusFor(viewer, status, assignedToMe)
  return (
    <StatusPill tone={tone} className={className}>
      {t(label)}
    </StatusPill>
  )
}
