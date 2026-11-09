import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { Header } from './Header'

export function AppLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-forest-700 px-4 py-2 font-medium text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('app.skipToContent')}
      </a>
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:py-10"
      >
        {/* Each page eases in when you arrive on it. */}
        <div key={location.pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
