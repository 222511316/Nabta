import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Defaults every signed-in page needs. A test that cares registers its own handler,
// which takes precedence. The bell gets an empty inbox:
const emptyInbox = http.get('*/api/notifications', () => HttpResponse.json({ unread: 0, items: [] }))
// AI features are off unless a test turns them on.
const aiOff = http.get('*/api/ai', () => HttpResponse.json({ enabled: false, model: null }))

export const server = setupServer(emptyInbox, aiOff)
