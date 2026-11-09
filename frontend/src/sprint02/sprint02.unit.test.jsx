// Sprint 02 unit tests (UT-14 to UT-17): interface helpers and one component in isolation,
// checked against the Project Charter's US10, US13 and FR06. No API calls are made.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AnalysisPanel } from '../features/analysis/AnalysisPanel'
import { caseStatusFor } from '../features/reviews/caseStatus'
import { confidenceLevel, formatPercent } from '../lib/format'
import { MAX_PHOTO_BYTES, validatePhotoFile } from '../lib/photoFile'
import { makeAnalysis } from '../test/fixtures'

describe('UT-14 confidence wording (US10, FR08)', () => {
  it('maps probabilities to plain words at the 0.9 and 0.7 boundaries', () => {
    expect(confidenceLevel(0.9)).toBe('high')
    expect(confidenceLevel(0.8999)).toBe('medium')
    expect(confidenceLevel(0.7)).toBe('medium')
    expect(confidenceLevel(0.6999)).toBe('low')
  })

  it('never shows 0% or 100%, since the model is never certain', () => {
    expect(formatPercent(0.9999, 'en')).toBe('99%')
    expect(formatPercent(0.0001, 'en')).toBe('1%')
    expect(formatPercent(0.84, 'en')).toBe('84%')
  })
})

describe('UT-15 photo file checks before upload (FR06)', () => {
  const file = (type, size) => {
    const f = new File(['x'], 'photo', { type })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('accepts JPEG, PNG and WebP up to exactly 10 MB', () => {
    expect(validatePhotoFile(file('image/jpeg', 1024))).toBeNull()
    expect(validatePhotoFile(file('image/png', MAX_PHOTO_BYTES))).toBeNull()
    expect(validatePhotoFile(file('image/webp', 5000))).toBeNull()
  })

  it('refuses a PDF, a GIF and a photo one byte over 10 MB', () => {
    expect(validatePhotoFile(file('application/pdf', 1024))).toBe('unsupported_image_type')
    expect(validatePhotoFile(file('image/gif', 1024))).toBe('unsupported_image_type')
    expect(validatePhotoFile(file('image/jpeg', MAX_PHOTO_BYTES + 1))).toBe('image_too_large')
  })
})

describe('UT-16 review status labels for each viewer (US13, FR15)', () => {
  it('flags the grower when a reply is needed and marks answered cases as done', () => {
    expect(caseStatusFor('grower', 'waiting_for_specialist')).toEqual({ label: 'caseStatus.grower.waiting_for_specialist', tone: 'neutral' })
    expect(caseStatusFor('grower', 'waiting_for_grower')).toEqual({ label: 'caseStatus.grower.waiting_for_grower', tone: 'attention' })
    expect(caseStatusFor('grower', 'answered').tone).toBe('done')
  })

  it('shows an untaken case as new and a taken one as waiting for that specialist', () => {
    expect(caseStatusFor('specialist', 'waiting_for_specialist', false).label).toBe('caseStatus.specialist.new')
    expect(caseStatusFor('specialist', 'waiting_for_specialist', true).label).toBe('caseStatus.specialist.waiting_for_specialist')
    expect(caseStatusFor('specialist', 'waiting_for_grower', true).tone).toBe('neutral')
  })
})

describe('UT-17 the unclear result panel (US10)', () => {
  const renderPanel = (result, onAsk) =>
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AnalysisPanel observation={{ id: 7, plant_id: 3 }} analysis={{ state: 'done', result, revealed: false }} onAsk={onAsk} />
        </QueryClientProvider>
      </MemoryRouter>,
    )

  it('explains an unfamiliar insect without percentages and offers three next steps', () => {
    const result = makeAnalysis({ outcome: 'unclear', unclear_reason: 'unfamiliar', predictions: [['aphids', 0.8], ['scale_insects', 0.1]] })
    renderPanel(result, vi.fn())

    expect(screen.getByText("Nabta can't tell what this is")).toBeInTheDocument()
    expect(screen.getByText(/doesn't look enough like the insects Nabta knows/)).toBeInTheDocument()
    expect(screen.queryByText(/80%/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a new photo' })).toHaveAttribute('href', '/observations/new?plantId=3')
    expect(screen.getByRole('link', { name: 'Compare with Aphids' })).toHaveAttribute('href', '/pests/aphids?observation=7')
    expect(screen.getByRole('button', { name: 'Ask a specialist' })).toBeInTheDocument()
  })

  it('hides "Ask a specialist" once a review exists', () => {
    renderPanel(makeAnalysis({ outcome: 'unclear', predictions: [['thrips', 0.4], ['aphids', 0.3]] }), undefined)
    expect(screen.queryByRole('button', { name: 'Ask a specialist' })).not.toBeInTheDocument()
    expect(screen.getByText(/Thrips \(40%\)/)).toBeInTheDocument()
  })
})
