import { afterEach, describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatDay, todayISO } from './dates'

const originalTimeZone = process.env.TZ

function useTimeZone(timeZone) {
  process.env.TZ = timeZone
}

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('todayISO', () => {
  it('returns the local calendar date, zero-padded', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('formatDate', () => {
  it('keeps the calendar date when the viewer is west of UTC', () => {
    useTimeZone('America/New_York')
    expect(formatDate('2026-09-20', 'en')).toBe('20 September 2026')
  })
})

describe('formatDay', () => {
  it('shows the local calendar day of a UTC timestamp', () => {
    useTimeZone('Asia/Riyadh')
    // 22:30 UTC on the 2nd is already 01:30 on the 3rd in Riyadh.
    expect(formatDay('2026-09-02T22:30:00Z', 'en')).toBe('3 September 2026')
  })
})

describe('formatDateTime', () => {
  it('shows a UTC timestamp in the viewer’s local time', () => {
    useTimeZone('Asia/Riyadh')
    expect(formatDateTime('2026-09-20T08:01:12Z', 'en')).toBe('20 September 2026 at 11:01')
  })
})
