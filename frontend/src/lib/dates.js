import { localeFor } from '../i18n'

const pad = (value) => String(value).padStart(2, '0')

/** Today's date in the viewer's own calendar, as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// `new Date('2026-09-20')` means midnight UTC, which is still the 19th in the
// Americas. Building the date from its parts keeps it on the right day.
function parseCalendarDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** "2026-09-20" → "20 September 2026" (in English). */
export function formatDate(isoDate, language) {
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'long' }).format(
    parseCalendarDate(isoDate),
  )
}

/** The viewer's local calendar day of a UTC timestamp from the API. */
export function formatDay(isoTimestamp, language) {
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'long' }).format(
    new Date(isoTimestamp),
  )
}

/** A UTC timestamp from the API, shown in the viewer's local time. */
export function formatDateTime(isoTimestamp, language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(isoTimestamp))
}

const RELATIVE_UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** How long ago a UTC timestamp from the API was: "3 hours ago", "yesterday", "now". */
export function formatRelativeTime(isoTimestamp, language, now = new Date()) {
  const seconds = (new Date(isoTimestamp).getTime() - now.getTime()) / 1000
  const format = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' })
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, 'second')
}

/** "2026-09-20" → "20 Sept", with the year only when it isn't this year. */
export function formatShortDate(isoDate, language, now = new Date()) {
  const date = parseCalendarDate(isoDate)
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date)
}

/** Whole calendar days from one YYYY-MM-DD date to another (negative if `to` is earlier). */
export function daysBetween(from, to) {
  const utc = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}
