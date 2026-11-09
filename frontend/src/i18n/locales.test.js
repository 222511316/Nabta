import { describe, expect, it } from 'vitest'
import { formatDate } from '../lib/dates'
import ar from './locales/ar.json'
import en from './locales/en.json'

const PLURAL = /_(zero|one|two|few|many|other)$/

function flatten(tree, prefix = '') {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]],
  )
}

const placeholders = (text) => new Set([...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1]))

describe('The Arabic interface text (US23)', () => {
  const english = Object.fromEntries(flatten(en).map(([key, value]) => [key.replace(PLURAL, ''), value]))
  const arabic = flatten(ar)

  it('translates every English string, and nothing else', () => {
    const arabicKeys = new Set(arabic.map(([key]) => key.replace(PLURAL, '')))
    expect([...arabicKeys].sort()).toEqual(Object.keys(english).sort())
  })

  it('has all six Arabic plural forms wherever English has a plural', () => {
    const plurals = Object.keys(english).filter((key) => `${key}_other` in Object.fromEntries(flatten(en)))
    for (const key of plurals) {
      const forms = arabic.filter(([k]) => k.replace(PLURAL, '') === key).map(([k]) => k.match(PLURAL)?.[1])
      expect(forms.sort(), key).toEqual(['few', 'many', 'one', 'other', 'two', 'zero'])
    }
  })

  it('keeps the same placeholders', () => {
    for (const [key, text] of arabic) {
      const wanted = placeholders(english[key.replace(PLURAL, '')])
      const found = placeholders(text)
      wanted.delete('count')
      found.delete('count')
      expect([...found].sort(), key).toEqual([...wanted].sort())
    }
  })

  it('writes dates with Arabic month names on the Gregorian calendar', () => {
    expect(formatDate('2026-09-20', 'ar')).toBe('20 سبتمبر 2026')
  })
})
