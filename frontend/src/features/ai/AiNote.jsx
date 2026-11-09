import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../lib/cx'

/** The label on everything an AI wrote (charter NFR14: content shows where it comes from). */
export function AiNote({ model, className }) {
  const { t } = useTranslation()
  return (
    <p className={cx('flex items-start gap-1.5 text-xs leading-relaxed text-muted', className)}>
      <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-pollen" />
      <span>{t('ai.note', { model })}</span>
    </p>
  )
}
