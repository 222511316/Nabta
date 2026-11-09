import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Sets the browser tab title to "<page> · Nabta". */
export function useDocumentTitle(pageTitle) {
  const { t } = useTranslation()
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${t('app.titleSuffix')}` : t('app.titleSuffix')
  }, [pageTitle, t])
}
