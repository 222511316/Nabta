import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { listPests } from '../../api/pests'
import { queryKeys } from '../../api/queryKeys'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { PageHeader } from '../../components/ui/layout'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** Every pest Nabta can suggest, each opening its reference page (US11). */
export function PestGuidePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pests.guideTitle'))
  const pests = useQuery({ queryKey: queryKeys.pests, queryFn: listPests })

  return (
    <>
      <PageHeader title={t('pests.guideTitle')} description={t('pests.guideSubtitle')} />
      {pests.isPending ? (
        <PageSpinner />
      ) : pests.isError ? (
        <LoadError message={t('pests.loadError')} onRetry={() => pests.refetch()} />
      ) : (
        <>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card sm:grid-cols-2">
            {pests.data.map((pest) => (
              <li key={pest.key} className="bg-white">
                <Link
                  to={`/pests/${pest.key}`}
                  className="group flex h-full gap-4 p-4 transition-colors outline-none hover:bg-sage-50 focus-visible:bg-sage-50 focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-inset"
                >
                  <img src={pest.image_url} alt="" className="size-20 shrink-0 rounded-lg bg-sage-50 object-cover" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-forest-800 underline-offset-4 group-hover:underline">
                      {pest.name}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted">{pest.summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pests.data.some((pest) => pest.review_status === 'awaiting_review') && (
            <p className="mt-4 text-sm text-muted">{t('pests.guideAwaiting')}</p>
          )}
        </>
      )}
    </>
  )
}
