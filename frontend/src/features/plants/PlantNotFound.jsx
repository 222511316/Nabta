import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../../components/ui/Button'
import { StatusPanel } from '../../components/ui/layout'

/** Shown for a missing plant and for another grower's plant alike (the API answers 404 for both). */
export function PlantNotFound() {
  const { t } = useTranslation()
  return (
    <StatusPanel
      icon={SearchX}
      title={t('plant.notFoundTitle')}
      action={<ButtonLink to="/dashboard">{t('plant.backToDashboard')}</ButtonLink>}
    >
      {t('plant.notFoundBody')}
    </StatusPanel>
  )
}
