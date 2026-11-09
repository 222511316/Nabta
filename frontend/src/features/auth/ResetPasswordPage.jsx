import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { confirmPasswordReset } from '../../api/auth'
import { AuthSection } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { PasswordField } from '../../components/ui/fields'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { rules } from '../../lib/validation'

function RequestNewLink() {
  const { t } = useTranslation()
  return (
    <Link to="/forgot-password" className="font-medium underline underline-offset-4">
      {t('resetPassword.requestNew')}
    </Link>
  )
}

export function ResetPasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('resetPassword.title'))
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { newPassword: '', confirmPassword: '' } })
  const r = rules(t)

  if (!token) {
    return (
      <AuthSection title={t('resetPassword.title')}>
        <Alert tone="warning" action={<RequestNewLink />}>
          {t('resetPassword.missingToken')}
        </Alert>
      </AuthSection>
    )
  }

  const onSubmit = async ({ newPassword }) => {
    setFailure(null)
    try {
      await confirmPasswordReset({ token, newPassword })
      navigate('/sign-in', { replace: true, state: { passwordReset: true } })
    } catch (error) {
      if (!applyFieldErrors(error, setError, t, { new_password: 'newPassword' })) setFailure(error)
    }
  }

  return (
    <AuthSection title={t('resetPassword.title')} subtitle={t('resetPassword.subtitle')}>
      {failure && (
        <Alert
          tone="danger"
          action={failure.code === 'invalid_reset_token' ? <RequestNewLink /> : undefined}
        >
          {errorMessage(t, failure)}
        </Alert>
      )}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <PasswordField
          label={t('resetPassword.newPassword')}
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register('newPassword', r.newPassword)}
        />
        <PasswordField
          label={t('resetPassword.confirmPassword')}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', r.confirmPassword(() => getValues('newPassword')))}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
        </Button>
      </form>
    </AuthSection>
  )
}
