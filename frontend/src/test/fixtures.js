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
    ...overrides,
  }
}

/** A File whose reported size can be set without allocating the bytes. */
export function fakeFile(name, type, size = 1024) {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
