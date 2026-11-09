import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Defaults every signed-in page needs. A test that cares registers its own handler,
// which takes precedence. The bell gets an empty inbox:
const emptyInbox = http.get('*/api/notifications', () => HttpResponse.json({ unread: 0, items: [] }))
// AI features are off unless a test turns them on.
const aiOff = http.get('*/api/ai', () => HttpResponse.json({ enabled: false, model: null }))
// The dashboard's "Needs attention" has nothing to report.
const quietSummary = http.get('*/api/summary', () =>
  HttpResponse.json({ tasks_overdue: 0, tasks_due_today: 0, reviews_waiting_for_you: 0, unclear_not_reviewed: 0, open_tasks: 0 }),
)

export const server = setupServer(emptyInbox, aiOff, quietSummary)
