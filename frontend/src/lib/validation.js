// Client-side rules mirroring the server's limits (spec §3.2–3.3), for instant feedback.
export const limits = {
  fullName: 100,
  email: 254,
  passwordMin: 8,
  passwordMax: 128,
  plantName: 80,
  plantType: 80,
  location: 120,
  plantNotes: 1000,
  observationNotes: 2000,
  reviewNote: 1000,
  caseMessage: 2000,
  otherPest: 80,
  pestQuestion: 300,
}

// Deliberately loose: something@something.tld. The server does the strict check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** react-hook-form rules, built with the active translation function. */
export function rules(t) {
  const required = t('validation.required')
  const maxLength = (max) => ({ value: max, message: t('validation.maxLength', { max }) })
  const notBlank = (value) => value.trim() !== '' || required

  return {
    requiredText: (max) => ({ required, validate: { notBlank }, maxLength: maxLength(max) }),
    optionalText: (max) => ({ maxLength: maxLength(max) }),
    email: {
      required,
      maxLength: maxLength(limits.email),
      pattern: { value: EMAIL_PATTERN, message: t('validation.emailInvalid') },
    },
    newPassword: {
      required,
      minLength: { value: limits.passwordMin, message: t('validation.passwordMin', { min: limits.passwordMin }) },
      maxLength: maxLength(limits.passwordMax),
    },
    confirmPassword: (getPassword) => ({
      required,
      validate: (value) => value === getPassword() || t('validation.passwordsMismatch'),
    }),
    anyPassword: { required },
  }
}

/** Trims an optional text input; blank becomes null, as the API expects. */
export const optionalValue = (value) => value.trim() || null
