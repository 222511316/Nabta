import { Hourglass, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../../components/ui/Button'
import { StatusPanel } from '../../components/ui/layout'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * Shown instead of the review queue and case pages to a specialist the Nabta team hasn't approved
 * yet (FR03, FR12, NFR06). The server refuses them every case anyway (403 specialist_pending).
 */
export function AwaitingApproval() {
  const { t } = useTranslation()
  useDocumentTitle(t('specialist.pendingTitle'))
  return (
    <StatusPanel
      icon={Hourglass}
      title={t('specialist.pendingTitle')}
      action={
        <ButtonLink to="/account" variant="secondary">
          <UserRound />
          {t('specialist.pendingAccount')}
        </ButtonLink>
      }
    >
      <div role="status" className="space-y-3">
        <p>{t('specialist.pendingBody')}</p>
        <p>{t('specialist.pendingNext')}</p>
      </div>
    </StatusPanel>
  )
}
