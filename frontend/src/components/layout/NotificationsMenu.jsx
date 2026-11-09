import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getInbox, markAllNotificationsRead, markNotificationRead } from '../../api/notifications'
import { queryKeys } from '../../api/queryKeys'
import { cx } from '../../lib/cx'
import { RelativeTime } from '../ui/RelativeTime'

const INBOX_REFRESH_MS = 30_000

/**
 * The header's notification bell (US13, FR15): questions, replies and assessments on
 * review cases, and reminders for tasks that are due (US18). It checks for new ones
 * every 30 seconds while the page is open.
 */
export function NotificationsMenu() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inbox = useQuery({ queryKey: queryKeys.notifications, queryFn: getInbox, refetchInterval: INBOX_REFRESH_MS })
  const unread = inbox.data?.unread ?? 0
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  const markRead = useMutation({ mutationFn: markNotificationRead, onSettled: refresh })
  const markAllRead = useMutation({ mutationFn: markAllNotificationsRead, onSettled: refresh })

  return (
    <Popover>
      <PopoverButton
        aria-label={unread > 0 ? t('notifications.buttonUnread', { count: unread }) : t('notifications.button')}
        className="relative flex size-10 items-center justify-center rounded-full text-forest-800 hover:bg-sage-50 data-open:bg-sage-50"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute end-1 top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-forest-700 px-1 text-[0.68rem] leading-none font-semibold text-white ring-2 ring-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </PopoverButton>
      <PopoverPanel
        anchor="bottom end"
        className="z-40 w-[min(23rem,calc(100vw-2rem))] rounded-xl border border-line bg-white shadow-raised [--anchor-gap:0.5rem] focus:outline-none"
      >
        {({ close }) => (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="font-semibold text-ink">{t('notifications.title')}</h2>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  className="rounded-md px-2 py-1 text-sm font-medium text-forest-700 hover:bg-forest-50"
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>
            {inbox.isError ? (
              <p className="px-4 py-6 text-sm text-muted">{t('notifications.loadError')}</p>
            ) : !inbox.data || inbox.data.items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{t('notifications.empty')}</p>
            ) : (
              <ul className="max-h-[min(28rem,70vh)] overflow-y-auto py-1">
                {inbox.data.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.link}
                      onClick={() => {
                        if (!item.read) markRead.mutate(item.id)
                        close()
                      }}
                      className="flex gap-3 px-4 py-3 outline-none hover:bg-sage-50 focus-visible:bg-sage-50 focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-inset"
                    >
                      <span
                        className={cx('mt-1.5 size-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-forest-600')}
                      >
                        {!item.read && <span className="sr-only">{t('notifications.unread')}</span>}
                      </span>
                      <span className="min-w-0">
                        <span className={cx('block text-sm', item.read ? 'text-muted' : 'font-medium text-ink')}>
                          {t(`notifications.kinds.${item.kind}`, {
                            actor: item.actor_name,
                            plant: item.plant_name,
                            task: item.task_title,
                          })}
                        </span>
                        <RelativeTime value={item.created_at} className="text-xs text-muted" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PopoverPanel>
    </Popover>
  )
}
