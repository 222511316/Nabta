import { Field, Label, Description as SwitchDescription, Switch } from '@headlessui/react'
import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { changePassword, deleteAccount, setResearchConsent, updateAccount } from '../../api/account'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { PasswordField, TextField } from '../../components/ui/fields'
import { FormDialog } from '../../components/ui/FormDialog'
import { Card, PageHeader } from '../../components/ui/layout'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatDateTime } from '../../lib/dates'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { limits, rules } from '../../lib/validation'

export function AccountPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  useDocumentTitle(t('account.title'))
  const isGrower = user.role === 'grower'
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('account.title')} description={t(isGrower ? 'account.subtitleGrower' : 'account.subtitle')} />
      <div className="space-y-8">
        <DetailsForm />
        <PasswordForm />
        {isGrower && <ResearchConsent />}
        {isGrower && <DeleteAccount />}
      </div>
    </div>
  )
}

function SectionCard({ id, title, intro, children, tone = 'default' }) {
  return (
    <Card aria-labelledby={id} className={cx('p-6 sm:p-8', tone === 'danger' && 'border-danger-200')}>
      <h2 id={id} className={cx('text-lg font-semibold', tone === 'danger' ? 'text-danger-700' : 'text-forest-800')}>
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
        {user.role === 'specialist' && (
          <div className="text-sm">
            <p className="text-muted">{t('account.approval')}</p>
            <p className="mt-0.5 font-medium text-ink">
              {user.specialist_status === 'approved' ? t('account.approvalApproved') : t('account.approvalPending')}
            </p>
          </div>
        )}
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

/** US22: research use of the grower's photos, separate from everything else and off by default. */
function ResearchConsent() {
  const { t, i18n } = useTranslation()
  const { user, setUser } = useAuth()
  const save = useMutation({
    mutationFn: setResearchConsent,
    onSuccess: (saved) => {
      setUser(saved)
      toast.success(saved.research_consent ? t('account.consentOn') : t('account.consentOff'))
    },
  })
  // The switch moves at once; it settles back if the change fails.
  const checked = save.isPending ? save.variables : user.research_consent

  return (
    <SectionCard id="consent-heading" title={t('account.consentTitle')}>
      <Field className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Label className="font-medium text-ink">{t('account.consentLabel')}</Label>
          <SwitchDescription className="mt-1 text-sm leading-relaxed text-muted">
            {t('account.consentBody')}
          </SwitchDescription>
        </div>
        <Switch
          checked={checked}
          onChange={(value) => save.mutate(value)}
          className="group relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full bg-sage-300 transition-colors data-checked:bg-forest-600 data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-forest-500"
        >
          <span className="pointer-events-none ms-0.5 mt-0.5 size-6 rounded-full bg-white shadow-sm transition-transform group-data-checked:translate-x-5 rtl:group-data-checked:-translate-x-5" />
        </Switch>
      </Field>
      <p className="mt-4 text-sm text-muted">
        {user.research_consent_at
          ? t('account.consentChanged', { date: formatDateTime(user.research_consent_at, i18n.language) })
          : t('account.consentNever')}
      </p>
      {save.isError && (
        <Alert tone="danger" className="mt-4">
          {errorMessage(t, save.error)}
        </Alert>
      )}
    </SectionCard>
  )
}

/** US22: everything goes, after the grower confirms with their password. */
function DeleteAccount() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <SectionCard
      id="delete-account-heading"
      title={t('account.deleteTitle')}
      intro={t('account.deleteIntro')}
      tone="danger"
    >
      <ul className="list-disc space-y-1 ps-5 text-sm text-ink marker:text-danger-600">
        {['plants', 'photos', 'reviews', 'tasks'].map((item) => (
          <li key={item}>{t(`account.deleteWhat.${item}`)}</li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end border-t border-line pt-6">
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 />
          {t('account.deleteButton')}
        </Button>
      </div>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </SectionCard>
  )
}

function DeleteAccountDialog({ onClose }) {
  const { t } = useTranslation()
  const { accountDeleted } = useAuth()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { password: '' } })
  const r = rules(t)

  const remove = useMutation({
    mutationFn: ({ password }) => deleteAccount(password),
    onSuccess: () => {
      toast.success(t('account.deleted'))
      accountDeleted()
    },
    onError: (error) => {
      if (error.code === 'wrong_password') {
        setError('password', { message: t('account.deleteWrongPassword') }, { shouldFocus: true })
      }
    },
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={handleSubmit((values) => remove.mutate(values))}
      icon={Trash2}
      tone="danger"
      title={t('account.deleteConfirmTitle')}
      description={t('account.deleteConfirmBody')}
      submitLabel={remove.isPending ? t('account.deleting') : t('account.deleteConfirm')}
      submitting={remove.isPending}
      error={remove.isError && remove.error.code !== 'wrong_password' ? errorMessage(t, remove.error) : null}
    >
      <PasswordField
        label={t('account.deletePassword')}
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password', r.anyPassword)}
      />
    </FormDialog>
  )
}
