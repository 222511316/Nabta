/** A readable message for an ApiError, falling back to a generic one. */
export function errorMessage(t, error) {
  return t(`errors.${error?.code}`, { defaultValue: t('errors.unknown') })
}

/** Network failures and server errors may succeed if simply tried again. */
export function isRetryable(error) {
  return error?.code === 'network_error' || error?.code === 'server_error'
}

/**
 * Shows the API's per-field error codes on the matching form inputs.
 * `fieldNames` maps API field names to form field names; other fields are ignored.
 * Returns true when at least one error was placed on an input.
 */
export function applyFieldErrors(error, setError, t, fieldNames) {
  let applied = false
  for (const [apiField, code] of Object.entries(error?.fields ?? {})) {
    const name = fieldNames[apiField]
    if (!name) continue
    setError(
      name,
      { type: 'server', message: t(`fieldErrors.${code}`, { defaultValue: t('fieldErrors.invalid') }) },
      { shouldFocus: !applied },
    )
    applied = true
  }
  return applied
}
