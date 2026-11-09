import { useTranslation } from 'react-i18next'
import { localeFor } from '../../i18n'
import { cx } from '../../lib/cx'
import { daysBetween, formatDate, formatShortDate } from '../../lib/dates'
import { observationResult } from '../observations/observationResult'

const DRAW_MS = 900
// Vertical layout of the ribbon, in rem: the gap label on top, then the line, then the ruler.
const LINE_TOP = 4
const RULER_TOP = 4.75

/** Where each observation sits on the ribbon (0–1), by its date. Same-day photos stack. */
function placeObservations(observations, first, span) {
  const perDay = {}
  return observations.map((observation) => {
    const stack = perDay[observation.observed_on] ?? 0
    perDay[observation.observed_on] = stack + 1
    const position = span === 0 ? 0.5 : daysBetween(first, observation.observed_on) / span
    return { observation, position, stack }
  })
}

/** The first of each month inside the range, away from the labelled ends. */
function monthTicks(first, last, span, language) {
  if (span === 0) return []
  const formatter = new Intl.DateTimeFormat(localeFor(language), { month: 'short' })
  const ticks = []
  let [year, month] = first.split('-').map(Number)
  while (ticks.length < 36) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    const iso = `${year}-${String(month).padStart(2, '0')}-01`
    if (iso > last) break
    ticks.push({ iso, label: formatter.format(new Date(year, month - 1, 1)), position: daysBetween(first, iso) / span })
  }
  // Every other month when they'd crowd a phone screen.
  const spaced = ticks.length > 6 ? ticks.filter((_, index) => index % 2 === 0) : ticks
  return spaced.map((tick) => ({ ...tick, labelled: tick.position > 0.14 && tick.position < 0.86 }))
}

/**
 * The plant's photos on a timeline, spaced by real time like marks on a ruler (US20). The two
 * being compared carry their letters, and the stretch between them says how far apart they are.
 * `onPick(observationId)` puts a photo in the slot being chosen.
 */
export function DateRibbon({ observations, selected, onPick }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const first = observations[0].observed_on
  const last = observations.at(-1).observed_on
  const span = daysBetween(first, last)
  const placed = placeObservations(observations, first, span)
  const months = monthTicks(first, last, span, language)
  // A small tick for every day; for every week once the photos span more than two months.
  const rulerStep = span <= 62 ? 1 : 7
  const slotOf = (id) => Object.entries(selected).find(([, chosen]) => chosen === id)?.[0]

  const [a, b] = ['a', 'b'].map((slot) => placed.find((p) => p.observation.id === selected[slot]))
  const gap = a && b ? Math.abs(daysBetween(a.observation.observed_on, b.observation.observed_on)) : null
  const from = a && b ? Math.min(a.position, b.position) : 0
  const to = a && b ? Math.max(a.position, b.position) : 0
  // Kept clear of the ends so the label never runs off a phone screen.
  const labelAt = Math.min(Math.max((from + to) / 2, 0.15), 0.85)

  return (
    <div className="overflow-x-clip">
      <div className="relative mx-4 h-32 sm:mx-6">
        {/* The line, drawn from the first photo to the last. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 h-1 origin-left animate-draw rounded-full bg-sage-200 rtl:origin-right"
          style={{ top: `${LINE_TOP}rem` }}
        />
        {span > 0 && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 h-1.5 animate-fade-in opacity-80"
            style={{
              top: `${RULER_TOP}rem`,
              backgroundImage: 'linear-gradient(to right, var(--color-sage-300) 1px, transparent 1px)',
              backgroundSize: `${(rulerStep / span) * 100}% 100%`,
              animationDelay: `${DRAW_MS}ms`,
            }}
          />
        )}
        {months.map((tick) => (
          <div
            key={tick.iso}
            aria-hidden="true"
            className="absolute flex -translate-x-1/2 flex-col items-center rtl:translate-x-1/2"
            style={{ insetInlineStart: `${tick.position * 100}%`, top: `${RULER_TOP}rem` }}
          >
            <span className="h-3 w-px bg-sage-500" />
            {tick.labelled && <span className="mt-1 text-xs whitespace-nowrap text-muted">{tick.label}</span>}
          </div>
        ))}
        <div aria-hidden="true" className="absolute inset-x-0 flex justify-between text-xs font-medium text-ink" style={{ top: `${RULER_TOP + 1.25}rem` }}>
          <span>{formatShortDate(first, language)}</span>
          {span > 0 && <span>{formatShortDate(last, language)}</span>}
        </div>

        {/* The stretch between the two photos being compared. */}
        {gap !== null && (
          <>
            <div
              aria-hidden="true"
              className="absolute h-2 rounded-full bg-forest-600 transition-all duration-500"
              style={{ top: `${LINE_TOP - 0.125}rem`, insetInlineStart: `${from * 100}%`, width: `${(to - from) * 100}%` }}
            />
            <p
              className="absolute top-0 -translate-x-1/2 rounded-full bg-forest-700 px-3 py-1 text-sm font-medium whitespace-nowrap text-white shadow-sm transition-all duration-500 rtl:translate-x-1/2"
              style={{ insetInlineStart: `${labelAt * 100}%` }}
            >
              {gap === 0 ? t('compare.sameDay') : t('compare.apart', { count: gap })}
            </p>
          </>
        )}

        <div role="group" aria-label={t('compare.ribbonLabel')}>
          {placed.map(({ observation, position, stack }) => {
            const slot = slotOf(observation.id)
            const date = formatDate(observation.observed_on, language)
            const result = observationResult(t, observation)
            return (
              <button
                key={observation.id}
                type="button"
                onClick={() => onPick(observation.id)}
                aria-pressed={Boolean(slot)}
                aria-label={[date, result, slot && t('compare.inSlot', { slot: t(`compare.slots.${slot}`) })]
                  .filter(Boolean)
                  .join(', ')}
                className="group absolute flex -translate-x-1/2 -translate-y-1/2 animate-pop flex-col items-center outline-none hover:z-10 focus-visible:z-10 rtl:translate-x-1/2"
                style={{
                  insetInlineStart: `${position * 100}%`,
                  top: `${LINE_TOP + 0.125 - stack * 1.1}rem`, // centred on the line; same-day photos stack up
                  animationDelay: `${150 + position * (DRAW_MS - 150)}ms`,
                }}
              >
                <span
                  className={cx(
                    'relative flex items-center justify-center rounded-full border-2 transition-all duration-200',
                    'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-forest-500',
                    'after:absolute after:-inset-3 after:content-[""]', // a finger-sized target
                    slot
                      ? 'size-7 border-forest-700 bg-forest-700 text-xs font-semibold text-white shadow-raised'
                      : 'size-4 border-forest-600 bg-white group-hover:scale-125 group-hover:bg-forest-100',
                  )}
                >
                  {slot && t(`compare.slots.${slot}`)}
                </span>
                {/* A glimpse of the photo on hover or keyboard focus. */}
                <span
                  aria-hidden="true"
                  className={cx(
                    'pointer-events-none absolute bottom-full mb-3 hidden w-24 overflow-hidden rounded-lg border border-line bg-white shadow-raised group-hover:block group-focus-visible:block',
                    position < 0.2 ? 'start-0' : position > 0.8 ? 'end-0' : '',
                  )}
                >
                  <img src={observation.thumb_url} alt="" className="aspect-square w-full object-cover" />
                  <span className="block px-1.5 py-1 text-[0.7rem] leading-tight text-ink">{date}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
