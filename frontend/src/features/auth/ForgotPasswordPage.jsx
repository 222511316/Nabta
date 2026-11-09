import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { requestPasswordReset } from '../../api/auth'
import { AuthSection } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { TextField } from '../../components/ui/fields'
import { errorMessage } from '../../lib/apiErrors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { rules } from '../../lib/validation'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('forgotPassword.title'))
  const [sentTo, setSentTo] = useState(null)
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '' } })

  const onSubmit = async ({ email }) => {
    setFailure(null)
    try {
      await requestPasswordReset({ email: email.trim() })
      setSentTo(email.trim())
    } catch (error) {
      setFailure(error)
    }
  }

  if (sentTo) {
    return (
      <AuthSection title={t('forgotPassword.sentTitle')}>
        <div className="flex gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-600">
            <MailCheck className="size-5" />
          </div>
          <p className="text-muted">{t('forgotPassword.sentBody', { email: sentTo })}</p>
        </div>
        <ButtonLink to="/sign-in" variant="secondary" className="w-full">
          {t('forgotPassword.backToSignIn')}
        </ButtonLink>
      </AuthSection>
    )
  }

  return (
    <AuthSection title={t('forgotPassword.title')} subtitle={t('forgotPassword.subtitle')}>
      {failure && <Alert tone="danger">{errorMessage(t, failure)}</Alert>}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField
          label={t('forgotPassword.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email', rules(t).email)}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
        </Button>
        <ButtonLink to="/sign-in" variant="ghost" className="w-full">
          {t('forgotPassword.backToSignIn')}
        </ButtonLink>
      </form>
    </AuthSection>
  )
}
