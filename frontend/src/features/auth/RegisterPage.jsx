import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '../../auth/useAuth'
import { useRoleParam } from '../../auth/useRoleParam'
import { AuthSection } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { PasswordField, TextField } from '../../components/ui/fields'
import { RoleSelector } from '../../components/ui/RoleSelector'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { limits, rules } from '../../lib/validation'

const API_FIELDS = { full_name: 'fullName', email: 'email', password: 'password' }

export function RegisterPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('register.title'))
  const { register: createAccount } = useAuth()
  const [role, setRole] = useRoleParam()
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' } })
  const r = rules(t)

  const onSubmit = async ({ fullName, email, password }) => {
    setFailure(null)
    try {
      const user = await createAccount({ fullName: fullName.trim(), email: email.trim(), password, role })
      if (user.specialist_status === 'pending') {
        // FR03, FR12: a specialist who signs up here waits for the Nabta team's approval.
        toast.success(t('register.specialistPending'), { duration: 10_000 })
      } else {
        toast.success(t('register.welcome', { name: user.full_name }))
      }
    } catch (error) {
      if (error.code === 'email_taken') {
        setError('email', { message: t('fieldErrors.email_taken') }, { shouldFocus: true })
      } else if (!applyFieldErrors(error, setError, t, API_FIELDS)) {
        setFailure(error)
      }
    }
  }

  return (
    <AuthSection
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <>
          {t('register.haveAccount')}{' '}
          <Link
            to={`/sign-in?as=${role}`}
            className="font-medium text-forest-700 underline-offset-4 hover:underline"
          >
            {t('register.signIn')}
          </Link>
        </>
      }
    >
      <RoleSelector legend={t('roles.joinAs')} value={role} onChange={setRole} detailed />
      {role === 'specialist' && (
        <p id="specialist-approval-note" className="text-sm text-muted">
          {t('register.specialistNote')}
        </p>
      )}
      {failure && <Alert tone="danger">{errorMessage(t, failure)}</Alert>}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField
          label={t('register.fullName')}
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName', r.requiredText(limits.fullName))}
        />
        <TextField
          label={t('register.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email', r.email)}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <PasswordField
            label={t('register.password')}
            hint={t('register.passwordHint')}
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password', r.newPassword)}
          />
          <PasswordField
            label={t('register.confirmPassword')}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', r.confirmPassword(() => getValues('password')))}
          />
        </div>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {isSubmitting ? t('register.submitting') : t('register.submit')}
        </Button>
      </form>
    </AuthSection>
  )
}
