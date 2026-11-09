/** A labelled determinate progress bar (NFR10). */
export function ProgressBar({ value, label, caption }) {
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-sage-100"
      >
        <div
          className="h-full rounded-full bg-forest-600 transition-[width] duration-200"
          style={{ width: `${value}%` }}
        />
      </div>
      {caption && <p className="text-sm text-muted">{caption}</p>}
    </div>
  )
}
