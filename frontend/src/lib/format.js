import { localeFor } from '../i18n'

/**
 * A model probability as a whole percentage. The model is never certain either
 * way, so the display stays between 1% and 99%.
 */
export function formatPercent(probability, language) {
  const shown = Math.min(Math.max(probability, 0.01), 0.99)
  return new Intl.NumberFormat(localeFor(language), { style: 'percent', maximumFractionDigits: 0 }).format(
    shown,
  )
}

/** Plain-language confidence for an identified result. */
export function confidenceLevel(probability) {
  if (probability >= 0.9) return 'high'
  if (probability >= 0.7) return 'medium'
  return 'low'
}

/** ["A", "B", "C"] → "A, B and C". */
export function formatList(items, language) {
  return new Intl.ListFormat(localeFor(language), { style: 'long', type: 'conjunction' }).format(items)
}
