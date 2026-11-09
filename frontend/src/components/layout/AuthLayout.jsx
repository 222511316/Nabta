import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { useRoleParam } from '../../auth/useRoleParam'
import { LeafScene } from '../brand/LeafScene'
import { LogoLink } from '../ui/Logo'

/** The form on the left; on wide screens, the leaf scene for the chosen role on the right. */
export function AuthLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const [role] = useRoleParam()

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-16">
        <header>
          <LogoLink to="/" />
        </header>
        <main id="main" className="flex flex-1 items-center py-10">
          <div key={location.pathname} className="mx-auto w-full max-w-md animate-page-in lg:mx-0">
            <Outlet />
          </div>
        </main>
        <footer className="text-xs text-muted">{t('landing.footer')}</footer>
      </div>

      <aside className="relative hidden overflow-hidden border-s border-line bg-wash bg-field-grid [--scene-halo:rgb(255_255_255/0.7)] lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12 lg:py-16">
        <LeafScene variant={role} pace={0.55} className="w-full max-w-[32rem]" />
        <div key={role} className="mt-8 max-w-sm animate-fade-in text-center">
          <p className="text-2xl font-medium tracking-tight text-forest-800">
            {t(`authLayout.${role}.headline`)}
          </p>
          <p className="mt-2 leading-relaxed text-muted">{t(`authLayout.${role}.body`)}</p>
        </div>
      </aside>
    </div>
  )
}

/** Heading, optional subtitle and content of one auth screen. */
export function AuthSection({ title, subtitle, children, footer }) {
  return (
    <section>
      <h1 className="text-3xl font-medium tracking-tight text-forest-800 sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
      <div className="mt-8 space-y-6">{children}</div>
      {footer && <p className="mt-8 text-sm text-muted">{footer}</p>}
    </section>
  )
}
