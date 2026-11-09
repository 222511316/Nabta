import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cx } from '../../lib/cx'

/** Horizontal lockup: the leaf-and-insect mark beside the wordmark. */
export function LogoLink({ to, className }) {
  const { t } = useTranslation()
  return (
    <Link
      to={to}
      aria-label={t('app.home')}
      className={cx('flex shrink-0 items-center gap-2 rounded-lg', className)}
    >
      <img src="/logo-mark.png" alt="" width="36" height="36" className="size-9" />
      <span className="text-xl font-semibold tracking-tight text-forest-700">{t('app.name')}</span>
    </Link>
  )
}
