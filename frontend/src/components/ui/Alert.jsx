import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cx } from '../../lib/cx'

const tones = {
  info: { box: 'border-forest-200 bg-forest-50 text-forest-900', Icon: Info },
  success: { box: 'border-forest-200 bg-forest-50 text-forest-900', Icon: CircleCheck },
  warning: { box: 'border-warning-200 bg-warning-50 text-warning-800', Icon: TriangleAlert },
  danger: { box: 'border-danger-200 bg-danger-50 text-danger-700', Icon: CircleAlert },
}

/** An inline message. Danger alerts are announced immediately; others politely. */
export function Alert({ tone = 'info', title, children, action, className }) {
  const { box, Icon } = tones[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}
