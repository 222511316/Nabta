import { ImagePlus, RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ACCEPTED_PHOTO_TYPES } from '../../lib/photoFile'
import { cx } from '../../lib/cx'

/**
 * Choose a photo by browsing (phones offer camera or gallery) or by dropping
 * a file. The <input> stays in the page so its label and errors always apply.
 * `photo` is { file, previewUrl } or null.
 */
export function PhotoPicker({ photo, error, onSelect, disabled }) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = `${inputId}-error`
  const [dragging, setDragging] = useState(false)

  const takeFile = (candidate) => {
    if (candidate) onSelect(candidate)
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {t('newObservation.photo')}
      </label>

      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(',')}
        className="peer sr-only"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          takeFile(event.target.files?.[0])
          event.target.value = '' // allow re-choosing the same file
        }}
      />

      {photo ? (
        <div className="overflow-hidden rounded-xl border border-line bg-sage-50">
          <img
            src={photo.previewUrl}
            alt={t('newObservation.previewAlt')}
            className="mx-auto max-h-80 w-full object-contain"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-white px-4 py-2.5">
            <span className="min-w-0 truncate text-sm text-muted">{photo.file.name}</span>
            <label
              htmlFor={inputId}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50"
            >
              <RefreshCw className="size-4" />
              {t('newObservation.changePhoto')}
            </label>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            takeFile(event.dataTransfer.files?.[0])
          }}
          className={cx(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest-500',
            error ? 'border-danger-600 bg-danger-50/40' : 'border-sage-300 bg-sage-50/60 hover:border-forest-400',
            dragging && 'border-forest-500 bg-forest-50',
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-white text-forest-600 shadow-card">
            <ImagePlus className="size-7" />
          </span>
          <span className="font-medium text-forest-800">{t('newObservation.dropTitle')}</span>
          <span className="text-sm text-muted">{t('newObservation.dropHint')}</span>
        </label>
      )}

      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  )
}
