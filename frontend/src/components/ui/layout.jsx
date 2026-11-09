import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cx } from '../../lib/cx'

export function Card({ as: Component = 'section', className, children, ...props }) {
  return (
    <Component
      className={cx('rounded-2xl border border-line bg-white shadow-card', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

/** Page title block with optional breadcrumb, description and actions. */
export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-8 space-y-3">
      {breadcrumb}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-forest-800 sm:text-3xl">{title}</h1>
          {description && <div className="mt-2 max-w-2xl text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
      </div>
    </div>
  )
}

/** items: [{ label, to? }]; the last item is the current page. */
export function Breadcrumb({ items }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('common.breadcrumb')}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <li aria-hidden="true">
                <ChevronRight className="size-4 text-sage-400 rtl:rotate-180" />
              </li>
            )}
            <li className="min-w-0">
              {item.to ? (
                <Link to={item.to} className="rounded hover:text-forest-700 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-ink">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}

/** A friendly placeholder for "nothing here yet". */
export function EmptyState({ icon: Icon, title, children, action, headingLevel = 'h2', className }) {
  const Heading = headingLevel
  return (
    <div
      className={cx(
        'flex flex-col items-center rounded-2xl border border-dashed border-sage-300 bg-white/60 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-sage-100 text-forest-600">
          <Icon className="size-7" />
        </div>
      )}
      <Heading className="text-lg font-semibold text-forest-800">{title}</Heading>
      {children && <div className="mt-2 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** A centred message for whole-page outcomes: not found, forbidden. */
export function StatusPanel({ icon: Icon, title, children, action }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-12 text-center">
      {Icon && (
        <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-sage-100 text-forest-600">
          <Icon className="size-8" />
        </div>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-forest-800">{title}</h1>
      {children && <div className="mt-3 text-muted">{children}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  )
}
