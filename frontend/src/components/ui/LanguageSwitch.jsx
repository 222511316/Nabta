import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n'
import { cx } from '../../lib/cx'

// Each language is named in itself, so it can be found by someone who can't read the current one.
const OTHER = {
  en: { code: 'ar', label: 'العربية' },
  ar: { code: 'en', label: 'English' },
}

/**
 * Switches between English and Arabic (US23) without leaving the page: the route,
 * the form being filled in and the scroll position all stay. `compact` shows only the
 * icon on phones; the language's name is still read out.
 */
export function LanguageSwitch({ className, compact = false }) {
  const { t, i18n } = useTranslation()
  const other = OTHER[i18n.language] ?? OTHER.en

  return (
    <button
      type="button"
      onClick={() => setLanguage(other.code)}
      title={t('language.switchTo', { language: other.label })}
      className={cx(
        'inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium text-forest-800 hover:bg-sage-50',
        className,
      )}
    >
      <Languages aria-hidden="true" className="size-4.5 shrink-0" />
      <span lang={other.code} className={compact ? 'sr-only sm:not-sr-only' : undefined}>
        {other.label}
      </span>
    </button>
  )
}
