import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert } from './Alert'
import { Button } from './Button'
import { Spinner } from './Spinner'

export function PageSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center py-20 text-forest-600">
      <Spinner label={t('common.loading')} className="size-7" />
    </div>
  )
}

/** A failed load, with a way to try again. */
export function LoadError({ message, onRetry }) {
  const { t } = useTranslation()
  return (
    <Alert
      tone="danger"
      title={message}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw />
          {t('common.retry')}
        </Button>
      }
    />
  )
}
