import { Focus, Lightbulb, Scan, Square, Sun, ZoomIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '../../components/ui/layout'

/** Photo-taking guidance (FR06). A clear, close photo matters for identification in Sprint 2. */
export function PhotoTips() {
  const { t } = useTranslation()
  const tips = [
    { Icon: ZoomIn, key: 'close' },
    { Icon: Focus, key: 'focus' },
    { Icon: Sun, key: 'light' },
    { Icon: Scan, key: 'single' },
    { Icon: Square, key: 'background' },
  ]
  return (
    <Card as="aside" aria-labelledby="photo-tips-heading" className="bg-forest-50/60 p-6">
      <h2 id="photo-tips-heading" className="flex items-center gap-2 font-semibold text-forest-800">
        <Lightbulb className="size-5 text-sage-600" />
        {t('photoTips.title')}
      </h2>
      <ul className="mt-4 space-y-3.5 text-sm text-ink">
        {tips.map(({ Icon, key }) => (
          <li key={key} className="flex gap-3">
            <Icon className="mt-0.5 size-4.5 shrink-0 text-forest-600" />
            <span>{t(`photoTips.${key}`)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
