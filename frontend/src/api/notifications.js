import { apiClient } from './client'

/** The latest notifications and the unread count (US13, FR15). */
export async function getInbox() {
  const { data } = await apiClient.get('/notifications')
  return data
}

export async function markNotificationRead(notificationId) {
  await apiClient.post(`/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead() {
  await apiClient.post('/notifications/read-all')
}
