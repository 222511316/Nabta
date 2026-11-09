import { dateLocales } from '../i18n'

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

const localeFor = (language) => dateLocales[language] ?? language

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
