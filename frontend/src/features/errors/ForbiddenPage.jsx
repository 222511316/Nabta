import { ShieldX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { homePathFor } from '../../auth/homePath'
import { ButtonLink } from '../../components/ui/Button'
import { StatusPanel } from '../../components/ui/layout'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function ForbiddenPage({ requiredRole }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  useDocumentTitle(t('forbidden.title'))
  return (
    <StatusPanel
      icon={ShieldX}
      title={t('forbidden.title')}
      action={<ButtonLink to={homePathFor(user)}>{t('forbidden.goHome')}</ButtonLink>}
    >
      {t(`forbidden.${requiredRole}`)}
    </StatusPanel>
  )
}
