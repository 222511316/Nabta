import { describe, expect, it } from 'vitest'
import { createRequestId } from './requestId'

describe('createRequestId', () => {
  it('uses crypto.randomUUID when the browser provides it', () => {
    const cryptoImpl = {
      randomUUID: () => '0f8f2c1e-5b1a-4c55-9d1e-8f3b2a1c0d9e',
      getRandomValues: () => {
        throw new Error('getRandomValues should not be needed')
      },
    }
    expect(createRequestId(cryptoImpl)).toBe('0f8f2c1e-5b1a-4c55-9d1e-8f3b2a1c0d9e')
  })

  // Phones testing the dev server over plain-http LAN are not a secure
  // context, so randomUUID is missing there but getRandomValues still works.
  it('builds a version-4 UUID from random bytes when randomUUID is missing', () => {
    const cryptoImpl = { getRandomValues: (bytes) => bytes.fill(0xff) }
    expect(createRequestId(cryptoImpl)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('sets the version and variant bits even when every random byte is zero', () => {
    const cryptoImpl = { getRandomValues: (bytes) => bytes.fill(0) }
    expect(createRequestId(cryptoImpl)).toBe('00000000-0000-4000-8000-000000000000')
  })
})
