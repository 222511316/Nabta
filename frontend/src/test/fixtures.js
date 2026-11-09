// Complete API objects, mirroring the response shapes in spec §3.4.

export const grower = {
  id: 1,
  email: 'sara@example.com',
  full_name: 'Sara Ahmed',
  role: 'grower',
  created_at: '2026-09-01T08:00:00Z',
}

export const specialist = {
  id: 2,
  email: 'khalid@example.com',
  full_name: 'Khalid Alharbi',
  role: 'specialist',
  created_at: '2026-09-01T08:05:00Z',
}

export function makePlant(overrides = {}) {
  return {
    id: 3,
    name: 'Lemon tree',
    plant_type: 'Lemon',
    location: 'Back garden',
    notes: null,
    created_at: '2026-09-02T09:00:00Z',
    updated_at: '2026-09-02T09:00:00Z',
    observation_count: 0,
    last_observed_on: null,
    cover_photo_url: null,
    ...overrides,
  }
}

export function makeObservation(overrides = {}) {
  const id = overrides.id ?? 7
  return {
    id,
    plant_id: 3,
    plant_name: 'Lemon tree',
    observed_on: '2026-09-20',
    notes: 'Small green insects under the leaves',
    photo_url: `/api/observations/${id}/photo`,
    thumb_url: `/api/observations/${id}/photo?variant=thumb`,
    photo_width: 2560,
    photo_height: 1920,
    created_at: '2026-09-20T08:01:12Z',
    analysis: null,
    review_status: null,
    ...overrides,
  }
}

const PEST_NAMES = {
  aphids: 'Aphids',
  whiteflies: 'Whiteflies',
  mealybugs: 'Mealybugs',
  thrips: 'Thrips',
}

/** Nabta's result for a photo: identified as the first prediction unless `outcome` says otherwise. */
export function makeAnalysis({ outcome = 'identified', predictions = [['aphids', 0.92], ['whiteflies', 0.05], ['mealybugs', 0.02]], ...overrides } = {}) {
  const ranked = predictions.map(([key, probability]) => ({ key, name: PEST_NAMES[key], probability }))
  return {
    outcome,
    unclear_reason: outcome === 'identified' ? null : 'uncertain',
    category: outcome === 'identified' ? { key: ranked[0].key, name: ranked[0].name } : null,
    confidence: ranked[0].probability,
    predictions: ranked,
    model_version: 'nabta-pest-1.0',
    created_at: '2026-09-20T08:01:15Z',
    ...overrides,
  }
}

export function makePest(overrides = {}) {
  const key = overrides.key ?? 'aphids'
  return {
    key,
    name: PEST_NAMES[key] ?? 'Aphids',
    summary: 'Small, soft-bodied insects that pierce tender plant parts and suck out the sap.',
    look_for: ['Soft, pear-shaped bodies with long legs and antennae', 'Two tube-like cornicles at the rear'],
    size: 'Small; often seen in dense groups.',
    where: 'Dense groups on leaves, stems and soft new shoots.',
    damage: 'Large colonies turn leaves yellow and stunt shoots.',
    look_alikes: 'Leafhoppers and plant bugs.',
    sources: [
      { title: 'Aphids', publisher: 'UC Statewide IPM Program (UC IPM)', url: 'https://ipm.ucanr.edu/home-and-landscape/aphids/' },
    ],
    review: { status: 'awaiting_review', reviewed_by: null, reviewed_on: null },
    images: [1, 2, 3].map((n) => ({
      url: `/api/pests/${key}/images/${key}-${n}.jpg`,
      caption: ['Close-up of one aphid', 'Black aphids on a stem', 'A colony on new growth'][n - 1],
      credit: 'IP102 dataset (Wu et al., CVPR 2019), class 28',
    })),
    ...overrides,
  }
}

export function makePestSummary(key = 'aphids', overrides = {}) {
  return {
    key,
    name: PEST_NAMES[key],
    summary: `About ${PEST_NAMES[key]}.`,
    image_url: `/api/pests/${key}/images/${key}-1.jpg`,
    review_status: 'awaiting_review',
    ...overrides,
  }
}

/** A review case as its grower sees it. */
export function makeGrowerCase(overrides = {}) {
  return {
    id: 12,
    observation_id: 7,
    status: 'waiting_for_specialist',
    note: 'They keep coming back.',
    specialist_name: null,
    messages: [],
    feedback: null,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    ...overrides,
  }
}

export function makeMessage(overrides = {}) {
  return {
    id: 1,
    kind: 'question',
    body: 'Are they on the young leaves or the old ones?',
    author_name: 'Khalid Alharbi',
    created_at: '2026-09-21T10:00:00Z',
    ...overrides,
  }
}

export function makeFeedback(overrides = {}) {
  return {
    outcome: 'identified',
    category: { key: 'aphids', name: 'Aphids' },
    other_pest: null,
    message: 'These are aphids. Rinse them off with a strong jet of water.',
    specialist_name: 'Khalid Alharbi',
    matches_suggestion: true,
    created_at: '2026-09-22T11:00:00Z',
    ...overrides,
  }
}

/** A case in the specialist's queue. */
export function makeQueueItem(overrides = {}) {
  return {
    id: 12,
    status: 'waiting_for_specialist',
    assigned_to_me: false,
    plant_name: 'Lemon tree',
    grower_name: 'Sara Ahmed',
    observed_on: '2026-09-20',
    suggestion: { outcome: 'identified', name: 'Aphids', confidence: 0.92 },
    thumb_url: '/api/specialist/cases/12/photo?variant=thumb',
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    ...overrides,
  }
}

/** A case as a specialist sees it when they open it. */
export function makeSpecialistCase(overrides = {}) {
  return {
    id: 12,
    status: 'waiting_for_specialist',
    assigned_to_me: false,
    note: 'They keep coming back.',
    grower_name: 'Sara Ahmed',
    plant: { name: 'Lemon tree', plant_type: 'Lemon', location: 'Back garden' },
    observation: {
      id: 7,
      observed_on: '2026-09-20',
      notes: 'Small green insects under the leaves',
      photo_url: '/api/specialist/cases/12/photo',
      thumb_url: '/api/specialist/cases/12/photo?variant=thumb',
      photo_width: 2560,
      photo_height: 1920,
    },
    analysis: makeAnalysis(),
    messages: [],
    feedback: null,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    ...overrides,
  }
}

export function makeNotification(overrides = {}) {
  return {
    id: 31,
    kind: 'question_asked',
    case_id: 12,
    plant_name: 'Lemon tree',
    actor_name: 'Khalid Alharbi',
    link: '/observations/7',
    read: false,
    created_at: '2026-09-21T10:00:00Z',
    ...overrides,
  }
}

/** A File whose reported size can be set without allocating the bytes. */
export function fakeFile(name, type, size = 1024) {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
