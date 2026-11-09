import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../lib/cx'
import { confidenceLevel, formatPercent } from '../../lib/format'
import { pestName } from '../../lib/pestName'

/**
 * A photo under study. While Nabta analyses it, the brand's magnifier sweeps across
 * it; when the result arrives, a specimen label is pinned to its corner. The label
 * repeats what the suggestion panel says, so assistive technology skips it.
 */
export function PhotoStage({ src, alt, width, height, analysis }) {
  const { t } = useTranslation()

  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-sage-50 shadow-card">
      <div className="relative">
        <img src={src} alt={alt} width={width} height={height} className="mx-auto max-h-[70vh] w-full object-contain" />
        {analysis?.state === 'analysing' && (
          <div aria-hidden="true" className="photo-sweep pointer-events-none absolute inset-0 animate-fade-in">
            <Loupe />
          </div>
        )}
        {analysis?.state === 'done' && <SpecimenLabel result={analysis.result} pinning={analysis.revealed} />}
      </div>
      <figcaption className="flex justify-end border-t border-line bg-white px-4 py-2.5">
        <a
          href={src}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-forest-700 hover:bg-forest-50"
        >
          <ExternalLink className="size-4" />
          {t('observation.openFull')}
        </a>
      </figcaption>
    </figure>
  )
}

function Loupe() {
  return (
    <div className="loupe">
      <div className="loupe-glass" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <circle cx="40" cy="40" r="27" fill="none" stroke="var(--color-pollen)" strokeWidth="6" />
        <path
          d="M23 33 A 18 18 0 0 1 33 22"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.75"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M61 61 L 88 88" stroke="var(--color-pollen)" strokeWidth="10" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function SpecimenLabel({ result, pinning }) {
  const { t, i18n } = useTranslation()
  const identified = result.outcome === 'identified'
  const percent = formatPercent(result.confidence, i18n.language)

  return (
    <div
      aria-hidden="true"
      data-testid="specimen-label"
      className={cx(
        'absolute start-3 bottom-3 max-w-[min(16rem,calc(100%-1.5rem))] rounded-md border border-forest-200 bg-white px-3.5 pt-3 pb-2.5 text-sm shadow-raised sm:start-4 sm:bottom-4',
        pinning && 'animate-pin',
      )}
    >
      <span className="absolute -top-1.5 start-4 size-3 rounded-full bg-pollen ring-2 ring-white" />
      <span className="block font-semibold text-forest-800">
        {identified ? pestName(t, result.category) : t('analysis.labelUnclear')}
      </span>
      <span className="mt-0.5 block text-muted">
        {identified
          ? t('analysis.confidence', { level: t(`analysis.levels.${confidenceLevel(result.confidence)}`), percent })
          : result.unclear_reason === 'unfamiliar'
            ? t('analysis.labelUnfamiliar')
            : t('analysis.labelNoMatch')}
      </span>
    </div>
  )
}
