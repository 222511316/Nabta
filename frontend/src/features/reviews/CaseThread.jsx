import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../lib/cx'
import { formatDateTime } from '../../lib/dates'

/**
 * A review case's conversation, oldest first (US15): the grower's request, then
 * questions and replies. Messages that arrive while it's on screen rise in.
 * `request` is { authorName, note, createdAt, label }; `viewerName` marks the
 * viewer's own messages with "(you)".
 */
export function CaseThread({ request, messages, viewerName }) {
  const { t, i18n } = useTranslation()
  // The messages already there when the thread first appeared; later ones are new arrivals.
  const [shownAtFirst] = useState(() => new Set(messages.map((message) => message.id)))
  const author = (name) => (name === viewerName ? t('review.you', { name }) : name)

  return (
    <ol className="space-y-5 border-s-2 border-line ps-5">
      <ThreadItem
        author={author(request.authorName)}
        label={request.label}
        time={formatDateTime(request.createdAt, i18n.language)}
        timestamp={request.createdAt}
        dot="bg-sage-400"
      >
        {request.note ?? <span className="text-muted">{t('review.noNote')}</span>}
      </ThreadItem>
      {messages.map((message) => (
        <ThreadItem
          key={message.id}
          author={author(message.author_name)}
          label={t(message.kind === 'question' ? 'review.question' : 'review.reply')}
          time={formatDateTime(message.created_at, i18n.language)}
          timestamp={message.created_at}
          dot={message.kind === 'question' ? 'bg-forest-600' : 'bg-sage-400'}
          arriving={!shownAtFirst.has(message.id)}
        >
          {message.body}
        </ThreadItem>
      ))}
    </ol>
  )
}

function ThreadItem({ author, label, time, timestamp, dot, arriving = false, children }) {
  return (
    <li className={cx('relative', arriving && 'animate-rise')}>
      <span aria-hidden="true" className={cx('absolute -start-[1.7rem] top-1 size-3 rounded-full ring-4 ring-white', dot)} />
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold text-ink">{author}</span>
        <span className="text-muted">{label}</span>
      </p>
      <time dateTime={timestamp} className="text-xs text-muted">
        {time}
      </time>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-ink">{children}</p>
    </li>
  )
}
