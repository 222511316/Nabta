import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../lib/cx'

const controlClasses = (invalid) =>
  cx(
    'block w-full rounded-lg border bg-white px-3.5 py-2.5 text-base text-ink shadow-xs',
    'placeholder:text-muted/70 transition-colors outline-none',
    'focus:ring-3 disabled:bg-sage-50 disabled:text-muted',
    invalid
      ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20'
      : 'border-line-strong hover:border-sage-600 focus:border-forest-600 focus:ring-forest-500/25',
  )

/**
 * Label, hint and error around one form control. `children` receives the
 * props that wire the control to its label and messages.
 */
export function Field({ id: idProp, label, hint, error, optional = false, className, children }) {
  const { t } = useTranslation()
  const autoId = useId()
  const id = idProp ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> ({t('common.optional')})</span>}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [errorId, hintId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextField({ label, hint, error, optional, className, id, ref, ...inputProps }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      {(fieldProps) => (
        <input ref={ref} className={controlClasses(error)} {...fieldProps} {...inputProps} />
      )}
    </Field>
  )
}

export function TextAreaField({ label, hint, error, optional, className, id, ref, rows = 4, ...props }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      {(fieldProps) => (
        <textarea
          ref={ref}
          rows={rows}
          className={cx(controlClasses(error), 'resize-y')}
          {...fieldProps}
          {...props}
        />
      )}
    </Field>
  )
}

export function SelectField({ label, hint, error, className, id, ref, children, ...props }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(fieldProps) => (
        <select ref={ref} className={cx(controlClasses(error), 'pe-10')} {...fieldProps} {...props}>
          {children}
        </select>
      )}
    </Field>
  )
}

export function PasswordField({ label, hint, error, className, id, ref, ...inputProps }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const ToggleIcon = visible ? EyeOff : Eye

  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(fieldProps) => (
        <div className="relative">
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={cx(controlClasses(error), 'pe-12')}
            {...fieldProps}
            {...inputProps}
          />
          <button
            type="button"
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
            aria-pressed={visible}
            className="absolute inset-y-1 end-1 flex w-10 items-center justify-center rounded-md text-muted hover:bg-forest-50 hover:text-forest-700"
          >
            <ToggleIcon className="size-5" />
          </button>
        </div>
      )}
    </Field>
  )
}
