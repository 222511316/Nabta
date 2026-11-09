import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'

export function FullPageSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <img src="/logo-mark.png" alt="" className="size-14 opacity-90" />
      <Spinner label={t('common.loading')} className="size-6 text-forest-600" />
    </div>
  )
}

export function FullPageError({ onRetry }) {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-sage-100 text-forest-600">
        <WifiOff className="size-8" />
      </div>
      <h1 className="text-2xl font-semibold text-forest-800">{t('fullPageError.title')}</h1>
      <p className="mt-3 max-w-md text-muted">{t('fullPageError.body')}</p>
      <Button className="mt-8" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </main>
  )
}
