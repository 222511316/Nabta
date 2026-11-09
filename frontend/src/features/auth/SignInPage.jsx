import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { useRoleParam } from '../../auth/useRoleParam'
import { AuthSection } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { PasswordField, TextField } from '../../components/ui/fields'
import { RoleSelector } from '../../components/ui/RoleSelector'
import { errorMessage } from '../../lib/apiErrors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { rules } from '../../lib/validation'

const otherRole = (role) => (role === 'grower' ? 'specialist' : 'grower')

export function SignInPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('signIn.title'))
  const { signIn } = useAuth()
  const location = useLocation()
  const [role, setRole] = useRoleParam()
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } })

  const chooseRole = (next) => {
    setRole(next)
    setFailure(null)
  }

  // Once signed in, PublicOnlyRoute sends the user on to where they were going.
  const onSubmit = async ({ email, password }) => {
    setFailure(null)
    try {
      await signIn({ email: email.trim(), password, role })
    } catch (error) {
      setFailure(error)
    }
  }

  const notice = location.state?.sessionExpired
    ? t('signIn.sessionExpired')
    : location.state?.passwordReset
      ? t('signIn.passwordReset')
      : null

  return (
    <AuthSection
      title={t('signIn.title')}
      subtitle={t('signIn.subtitle')}
      footer={
        <>
          {t('signIn.noAccount')}{' '}
          <Link
            to={`/register?as=${role}`}
            className="font-medium text-forest-700 underline-offset-4 hover:underline"
          >
            {t('signIn.createAccount')}
          </Link>
        </>
      }
    >
      {notice && <Alert tone="info">{notice}</Alert>}
      <RoleSelector legend={t('roles.signInAs')} value={role} onChange={chooseRole} />
      {failure?.code === 'role_mismatch' ? (
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => chooseRole(otherRole(role))}>
              {t(`signIn.switchTo.${otherRole(role)}`)}
            </Button>
          }
        >
          {t(`signIn.roleMismatch.${otherRole(role)}`)}
        </Alert>
      ) : (
        failure && <Alert tone="danger">{errorMessage(t, failure)}</Alert>
      )}

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField
          label={t('signIn.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email', { required: t('validation.required') })}
        />
        <div className="space-y-2">
          <PasswordField
            label={t('signIn.password')}
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password', rules(t).anyPassword)}
          />
          <div className="text-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-forest-700 underline-offset-4 hover:underline"
            >
              {t('signIn.forgot')}
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {isSubmitting ? t('signIn.submitting') : t('signIn.submit')}
        </Button>
      </form>
    </AuthSection>
  )
}
