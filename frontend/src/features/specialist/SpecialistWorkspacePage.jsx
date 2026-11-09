import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { queryKeys } from '../../api/queryKeys'
import { listReviewCases } from '../../api/specialist'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { EmptyState, PageHeader } from '../../components/ui/layout'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * The specialist workspace (US08). Review requests arrive in Sprint 2 (US12,
 * US14); until then the queue is always empty and this page proves access.
 */
export function SpecialistWorkspacePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('specialist.title'))
  const cases = useQuery({ queryKey: queryKeys.reviewCases, queryFn: listReviewCases })

  return (
    <>
      <PageHeader title={t('specialist.title')} description={t('specialist.subtitle')} />
      {cases.isPending ? (
        <PageSpinner />
      ) : cases.isError ? (
        <LoadError message={t('specialist.loadError')} onRetry={() => cases.refetch()} />
      ) : (
        <EmptyState icon={Inbox} title={t('specialist.emptyTitle')}>
          {t('specialist.emptyBody')}
        </EmptyState>
      )}
    </>
  )
}
