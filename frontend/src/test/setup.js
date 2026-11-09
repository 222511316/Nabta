import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import '../i18n'
import { server } from './server'

// jsdom's Blob has no stream(). MSW reads request bodies through undici, which
// streams uploaded files, so without this every photo upload in a test hangs.
if (!Blob.prototype.stream) {
  Blob.prototype.stream = function stream() {
    const blob = this
    return new ReadableStream({
      async start(controller) {
        controller.enqueue(new Uint8Array(await blob.arrayBuffer()))
        controller.close()
      },
    })
  }
}

// jsdom has no ResizeObserver; Headless UI's anchored menus observe their size.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no object URLs; photo previews only need a placeholder src.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:nabta-test-preview'
  URL.revokeObjectURL = () => {}
}

// Every API call in a test must be answered by a handler the test declared.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
