import { cx } from '../../lib/cx'

const tones = {
  neutral: 'bg-sage-100 text-sage-800',
  attention: 'bg-warning-50 text-warning-800 ring-1 ring-warning-200 ring-inset',
  done: 'bg-forest-50 text-forest-800 ring-1 ring-forest-200 ring-inset',
}

/** A short status in words, with a dot in the same colour. `attention` means it's the viewer's turn. */
export function StatusPill({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  )
}
