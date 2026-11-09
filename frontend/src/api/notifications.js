import { todayISO } from '../lib/dates'
import { apiClient } from './client'

/**
 * The latest notifications and the unread count (US13, FR15). Sending the grower's own
 * date lets task reminders (US18) arrive on their day, not the server's.
 */
export async function getInbox() {
  const { data } = await apiClient.get('/notifications', { params: { today: todayISO() } })
  return data
}

export async function markNotificationRead(notificationId) {
  await apiClient.post(`/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead() {
  await apiClient.post('/notifications/read-all')
}
