import { describe, expect, it } from 'vitest'
import { confidenceLevel, formatList, formatPercent } from './format'

describe('formatPercent', () => {
  it('shows a probability as a whole percentage', () => {
    expect(formatPercent(0.923, 'en')).toBe('92%')
    expect(formatPercent(0.05, 'en')).toBe('5%')
  })

  it('never claims certainty either way', () => {
    expect(formatPercent(0.999, 'en')).toBe('99%')
    expect(formatPercent(0.0004, 'en')).toBe('1%')
  })
})

describe('confidenceLevel', () => {
  it('puts a probability into plain words', () => {
    expect(confidenceLevel(0.95)).toBe('high')
    expect(confidenceLevel(0.9)).toBe('high')
    expect(confidenceLevel(0.8)).toBe('medium')
    expect(confidenceLevel(0.62)).toBe('low')
  })
})

describe('formatList', () => {
  it('joins items the way a sentence would', () => {
    expect(formatList(['Whiteflies (5%)', 'Mealybugs (3%)'], 'en')).toBe('Whiteflies (5%) and Mealybugs (3%)')
  })
})
