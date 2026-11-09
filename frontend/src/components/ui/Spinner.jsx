import { cx } from '../../lib/cx'

/** A spinning ring. Pass `label` when it is the only sign that something is loading. */
export function Spinner({ label, className }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={cx('animate-spin', className ?? 'size-5')}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}
