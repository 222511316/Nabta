/**
 * A random UUID identifying one observation submission. Retrying a failed
 * upload re-sends the same id, so the server never saves it twice.
 */
export function createRequestId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID()

  // randomUUID only exists in secure contexts (https or localhost).
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    '-',
  )
}
