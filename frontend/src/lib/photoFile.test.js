import { describe, expect, it } from 'vitest'
import { fakeFile } from '../test/fixtures'
import { validatePhotoFile } from './photoFile'

const MB = 1024 * 1024

describe('validatePhotoFile', () => {
  it.each([
    ['a JPEG', fakeFile('bug.jpg', 'image/jpeg', 2 * MB), null],
    ['a PNG of exactly 10 MB', fakeFile('bug.png', 'image/png', 10 * MB), null],
    ['a WebP', fakeFile('bug.webp', 'image/webp', 500), null],
    ['a JPEG one byte over 10 MB', fakeFile('big.jpg', 'image/jpeg', 10 * MB + 1), 'image_too_large'],
    ['a GIF', fakeFile('bug.gif', 'image/gif'), 'unsupported_image_type'],
    ['a HEIC photo', fakeFile('bug.heic', 'image/heic'), 'unsupported_image_type'],
    ['a PDF', fakeFile('notes.pdf', 'application/pdf'), 'unsupported_image_type'],
    ['a file the browser could not type', fakeFile('mystery', ''), 'unsupported_image_type'],
  ])('%s → %s', (_label, file, expected) => {
    expect(validatePhotoFile(file)).toBe(expected)
  })
})
