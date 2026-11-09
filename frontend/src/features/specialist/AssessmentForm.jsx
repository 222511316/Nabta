import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { draftAssessment } from '../../api/ai'
import { listPests } from '../../api/pests'
import { queryKeys } from '../../api/queryKeys'
import { sendAssessment } from '../../api/specialist'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField, TextAreaField, TextField } from '../../components/ui/fields'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { limits, rules } from '../../lib/validation'
import { AiNote } from '../ai/AiNote'
import { useAiStatus } from '../ai/useAiStatus'

const OTHER_PEST = 'other'
const API_FIELDS = { category_key: 'pestKey', other_pest: 'otherPest', message: 'message' }

/**
 * The specialist's assessment (US16): agree with Nabta, name a different pest (one of
 * Nabta's categories or something else), or say the photo isn't enough. Sending closes
 * the case and notifies the grower.
 */
export function AssessmentForm({ reviewCase }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const pests = useQuery({ queryKey: queryKeys.pests, queryFn: listPests })
  const r = rules(t)
  const suggested = reviewCase.analysis?.outcome === 'identified' ? reviewCase.analysis.category : null
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({ defaultValues: { outcome: '', pestKey: '', otherPest: '', message: '' } })
  const [outcome, pestKey] = useWatch({ control, name: ['outcome', 'pestKey'] })

  const send = useMutation({
    mutationFn: (values) => sendAssessment(reviewCase.id, toPayload(values, suggested)),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.reviewCase(reviewCase.id), updated)
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewCases, exact: true })
      toast.success(t('case.sent'))
    },
    onError: (error) => {
      applyFieldErrors(error, setError, t, API_FIELDS)
      if (error.code === 'case_closed') queryClient.invalidateQueries({ queryKey: queryKeys.reviewCase(reviewCase.id) })
    },
  })

  const options = [
    ...(suggested ? [{ value: 'agree', label: t('case.agree', { name: suggested.name }) }] : []),
    { value: 'different', label: suggested ? t('case.different') : t('case.namePest') },
    { value: 'inconclusive', label: t('case.inconclusive') },
  ]
  const shownErrors = send.error?.code === 'validation_error' ? null : send.error

  return (
    <form onSubmit={handleSubmit((values) => send.mutate(values))} noValidate className="space-y-5">
      <fieldset aria-describedby={errors.outcome ? 'outcome-error' : undefined}>
        <legend className="text-sm font-medium text-ink">{t('case.outcome')}</legend>
        <div className="mt-2 space-y-2">
          {options.map((option) => (
            <label
              key={option.value}
              className={cx(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm font-medium transition-colors',
                'has-checked:border-forest-500 has-checked:bg-forest-50 has-checked:text-forest-800',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-forest-500',
                errors.outcome ? 'border-danger-600' : 'border-line-strong hover:border-sage-600',
              )}
            >
              <input
                type="radio"
                value={option.value}
                className="size-4 accent-forest-700"
                {...register('outcome', { required: t('case.outcomeRequired') })}
              />
              {option.label}
            </label>
          ))}
        </div>
        {errors.outcome && (
          <p id="outcome-error" className="mt-1.5 text-sm font-medium text-danger-600">
            {errors.outcome.message}
          </p>
        )}
      </fieldset>

      {outcome === 'different' && (
        <div className="animate-fade-in space-y-4">
          <SelectField
            label={t('case.pest')}
            error={errors.pestKey?.message}
            {...register('pestKey', { required: t('case.pestRequired') })}
          >
            <option value="">{t('case.choosePest')}</option>
            {(pests.data ?? []).map((pest) => (
              <option key={pest.key} value={pest.key}>
                {pest.name}
              </option>
            ))}
            <option value={OTHER_PEST}>{t('case.otherPest')}</option>
          </SelectField>
          {pestKey === OTHER_PEST && (
            <TextField
              label={t('case.otherPestName')}
              error={errors.otherPest?.message}
              {...register('otherPest', r.requiredText(limits.otherPest))}
            />
          )}
        </div>
      )}

      <AiDraft
        reviewCase={reviewCase}
        decision={() => decisionFrom(getValues(), suggested)}
        onUse={(message) => setValue('message', message, { shouldValidate: true, shouldDirty: true })}
      />

      <TextAreaField
        label={t('case.message')}
        hint={t('case.messageHint')}
        rows={5}
        error={errors.message?.message}
        {...register('message', r.requiredText(limits.caseMessage))}
      />

      {shownErrors && <Alert tone="danger">{errorMessage(t, shownErrors)}</Alert>}

      <div className="space-y-2">
        <Button type="submit" loading={send.isPending} className="w-full">
          {send.isPending ? t('case.sending') : t('case.send')}
        </Button>
        <p className="text-center text-xs text-muted">{t('case.closes')}</p>
      </div>
    </form>
  )
}

function toPayload({ outcome, pestKey, otherPest, message }, suggested) {
  if (outcome === 'inconclusive') return { outcome: 'inconclusive', message: message.trim() }
  if (outcome === 'agree') return { outcome: 'identified', categoryKey: suggested.key, message: message.trim() }
  if (pestKey === OTHER_PEST) return { outcome: 'identified', otherPest: otherPest.trim(), message: message.trim() }
  return { outcome: 'identified', categoryKey: pestKey, message: message.trim() }
}

/** The specialist's choice so far, for the AI draft to agree with. */
function decisionFrom({ outcome, pestKey, otherPest }, suggested) {
  if (outcome === 'inconclusive') return { outcome: 'inconclusive' }
  if (outcome === 'agree') return { outcome: 'identified', categoryKey: suggested.key }
  if (outcome === 'different' && pestKey === OTHER_PEST && otherPest.trim()) {
    return { outcome: 'identified', otherPest: otherPest.trim() }
  }
  if (outcome === 'different' && pestKey && pestKey !== OTHER_PEST) return { outcome: 'identified', categoryKey: pestKey }
  return {}
}

/**
 * "Draft with AI": the draft is shown on its own first, and only replaces the message
 * when the specialist chooses to use it. Nothing is ever sent without them.
 */
function AiDraft({ reviewCase, decision, onUse }) {
  const { t } = useTranslation()
  const ai = useAiStatus()
  const [shown, setShown] = useState(null)
  const draft = useMutation({
    mutationFn: () => draftAssessment(reviewCase.id, decision()),
    onSuccess: setShown,
  })
  if (!ai.enabled) return null

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => draft.mutate()} loading={draft.isPending}>
          <Sparkles className="text-pollen" />
          {draft.isPending ? t('draft.drafting') : t('draft.button')}
        </Button>
      </div>
      {draft.isError && (
        <Alert tone="danger" title={t('draft.failedTitle')}>
          {errorMessage(t, draft.error)}
        </Alert>
      )}
      {shown && (
        <section aria-labelledby="ai-draft-heading" className="animate-fade-in rounded-xl border border-sage-300 bg-sage-50 p-4">
          <h3 id="ai-draft-heading" className="flex items-center gap-2 text-sm font-semibold text-forest-800">
            <Sparkles aria-hidden="true" className="size-4 text-pollen" />
            {t('draft.title')}
          </h3>
          <p className="mt-1 text-xs text-muted">{t('draft.hint')}</p>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink">{shown.message}</p>
          <AiNote model={shown.model} className="mt-3" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                onUse(shown.message)
                setShown(null)
              }}
            >
              {t('draft.use')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShown(null)}>
              {t('draft.discard')}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
