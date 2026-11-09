import { useMutation } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { askAboutPest } from '../../api/ai'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextAreaField } from '../../components/ui/fields'
import { Card } from '../../components/ui/layout'
import { errorMessage } from '../../lib/apiErrors'
import { limits, rules } from '../../lib/validation'
import { AiNote } from './AiNote'
import { useAiStatus } from './useAiStatus'

/**
 * Questions about a pest, answered by AI from this page's reviewed guide only (NFR14).
 * `observationId` (the grower's own) gives the answer the plant's context. Answers are not kept.
 */
export function AskAboutPest({ pest, observationId }) {
  const { t } = useTranslation()
  const ai = useAiStatus()
  const r = rules(t)
  const [answers, setAnswers] = useState([])
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { question: '' } })
  const ask = useMutation({
    mutationFn: (question) => askAboutPest(pest.key, question, observationId),
    onSuccess: (answer, question) => {
      setAnswers((asked) => [...asked, { question, ...answer }])
      reset()
    },
  })
  if (!ai.enabled) return null

  return (
    <Card aria-labelledby="ask-heading" className="p-5">
      <h2 id="ask-heading" className="flex items-center gap-2 font-semibold text-forest-800">
        <Sparkles aria-hidden="true" className="size-4 text-pollen" />
        {t('ask.title', { name: pest.name })}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('ask.intro')}</p>

      {answers.length > 0 && (
        <ol className="mt-4 space-y-4 border-t border-line pt-4">
          {answers.map((answer, index) => (
            <li key={index} className="animate-rise space-y-1.5 text-sm">
              <p className="font-medium text-ink">
                <span className="sr-only">{t('ask.you')}: </span>
                {answer.question}
              </p>
              <p className="leading-relaxed text-ink">{answer.answer}</p>
              {!answer.covered_by_guide && <p className="text-muted">{t('ask.notCovered')}</p>}
              {answer.suggest_specialist && <p className="font-medium text-forest-700">{t('ask.askSpecialist')}</p>}
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={handleSubmit(({ question }) => ask.mutate(question.trim()))}
        noValidate
        className="mt-4 space-y-3"
      >
        <TextAreaField
          label={t('ask.label')}
          rows={2}
          error={formState.errors.question?.message}
          {...register('question', r.requiredText(limits.pestQuestion))}
        />
        {ask.isError && (
          <Alert tone="danger" title={t('ask.failedTitle')}>
            {errorMessage(t, ask.error)}
          </Alert>
        )}
        <Button type="submit" size="sm" loading={ask.isPending}>
          {ask.isPending ? t('ask.asking') : t('ask.submit')}
        </Button>
      </form>
      {answers.length > 0 && <AiNote model={answers.at(-1).model} className="mt-4" />}
    </Card>
  )
}
