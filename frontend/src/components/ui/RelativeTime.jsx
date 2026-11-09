import { useTranslation } from 'react-i18next'
import { formatDateTime, formatRelativeTime } from '../../lib/dates'

/** "3 hours ago", with the exact date and time on hover and for assistive technology. */
export function RelativeTime({ value, template, className }) {
  const { t, i18n } = useTranslation()
  const relative = formatRelativeTime(value, i18n.language)
  return (
    <time dateTime={value} title={formatDateTime(value, i18n.language)} className={className}>
      {template ? t(template, { time: relative }) : relative}
    </time>
  )
}
