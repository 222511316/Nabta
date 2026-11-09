import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { changePassword, updateAccount } from '../../api/account'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { PasswordField, TextField } from '../../components/ui/fields'
import { Card, PageHeader } from '../../components/ui/layout'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { limits, rules } from '../../lib/validation'

export function AccountPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('account.title'))
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('account.title')} description={t('account.subtitle')} />
      <div className="space-y-8">
        <DetailsForm />
        <PasswordForm />
      </div>
    </div>
  )
}

function SectionCard({ id, title, intro, children }) {
  return (
    <Card aria-labelledby={id} className="p-6 sm:p-8">
      <h2 id={id} className="text-lg font-semibold text-forest-800">
        {title}
      </h2>
      {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  )
}

function DetailsForm() {
  const { t } = useTranslation()
  const { user, setUser } = useAuth()
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ defaultValues: { fullName: user.full_name, email: user.email } })
  const r = rules(t)

  const onSubmit = async ({ fullName, email }) => {
    setFailure(null)
    try {
      const saved = await updateAccount({ fullName: fullName.trim(), email: email.trim() })
      setUser(saved)
      reset({ fullName: saved.full_name, email: saved.email })
      toast.success(t('account.saved'))
    } catch (error) {
      if (error.code === 'email_taken') {
        setError('email', { message: t('fieldErrors.email_taken') }, { shouldFocus: true })
      } else if (!applyFieldErrors(error, setError, t, { full_name: 'fullName', email: 'email' })) {
        setFailure(error)
      }
    }
  }

  return (
    <SectionCard id="details-heading" title={t('account.detailsTitle')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {failure && <Alert tone="danger">{errorMessage(t, failure)}</Alert>}
        <TextField
          label={t('account.fullName')}
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName', r.requiredText(limits.fullName))}
        />
        <TextField
          label={t('account.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email', r.email)}
        />
        <div className="text-sm">
          <p className="text-muted">{t('account.accountType')}</p>
          <p className="mt-0.5 font-medium text-ink">{t(`nav.roles.${user.role}`)}</p>
        </div>
        <div className="flex justify-end border-t border-line pt-6">
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            {isSubmitting ? t('account.saving') : t('account.save')}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}

function PasswordForm() {
  const { t } = useTranslation()
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } })
  const r = rules(t)

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setFailure(null)
    try {
      await changePassword({ currentPassword, newPassword })
      reset()
      toast.success(t('account.passwordChanged'))
    } catch (error) {
      if (error.code === 'wrong_password') {
        setError('currentPassword', { message: t('fieldErrors.wrong_password') }, { shouldFocus: true })
      } else if (
        !applyFieldErrors(error, setError, t, {
          current_password: 'currentPassword',
          new_password: 'newPassword',
        })
      ) {
        setFailure(error)
      }
    }
  }

  return (
    <SectionCard id="password-heading" title={t('account.passwordTitle')} intro={t('account.passwordIntro')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {failure && <Alert tone="danger">{errorMessage(t, failure)}</Alert>}
        <PasswordField
          label={t('account.currentPassword')}
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword', r.anyPassword)}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <PasswordField
            label={t('account.newPassword')}
            hint={t('register.passwordHint')}
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword', r.newPassword)}
          />
          <PasswordField
            label={t('account.confirmPassword')}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', r.confirmPassword(() => getValues('newPassword')))}
          />
        </div>
        <div className="flex justify-end border-t border-line pt-6">
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? t('account.changing') : t('account.changePassword')}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}
