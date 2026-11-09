import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../../components/ui/Button'
import { StatusPanel } from '../../components/ui/layout'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('notFound.title'))
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4">
      <img src="/logo-mark.png" alt="" className="mb-2 size-12" />
      <StatusPanel
        icon={SearchX}
        title={t('notFound.title')}
        action={<ButtonLink to="/">{t('notFound.goHome')}</ButtonLink>}
      >
        {t('notFound.body')}
      </StatusPanel>
    </main>
  )
}
