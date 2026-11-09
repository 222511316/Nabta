import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Sprout } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { createObservation } from '../../api/observations'
import { listPlants } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { SelectField, TextAreaField, TextField } from '../../components/ui/fields'
import { Breadcrumb, Card, EmptyState, PageHeader } from '../../components/ui/layout'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { applyFieldErrors, errorMessage, isRetryable } from '../../lib/apiErrors'
import { todayISO } from '../../lib/dates'
import { validatePhotoFile } from '../../lib/photoFile'
import { createRequestId } from '../../lib/requestId'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { limits, rules } from '../../lib/validation'
import { PhotoPicker } from './PhotoPicker'
import { PhotoTips } from './PhotoTips'

const API_FIELDS = { observed_on: 'observedOn', notes: 'notes' }
const EARLIEST_DATE = '2000-01-01'

export function NewObservationPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('newObservation.title'))
  const [searchParams] = useSearchParams()
  const plants = useQuery({ queryKey: queryKeys.plants, queryFn: listPlants })

  let content
  if (plants.isPending) content = <PageSpinner />
  else if (plants.isError) {
    content = <LoadError message={errorMessage(t, plants.error)} onRetry={() => plants.refetch()} />
  } else if (plants.data.length === 0) {
    content = (
      <EmptyState
        icon={Sprout}
        title={t('newObservation.noPlantsTitle')}
        action={
          <ButtonLink to="/plants/new">
            <Plus />
            {t('newObservation.addPlant')}
          </ButtonLink>
        }
      >
        {t('newObservation.noPlantsBody')}
      </EmptyState>
    )
  } else {
    content = <ObservationForm plants={plants.data} requestedPlantId={searchParams.get('plantId')} />
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[{ label: t('nav.dashboard'), to: '/dashboard' }, { label: t('newObservation.title') }]}
          />
        }
        title={t('newObservation.title')}
        description={t('newObservation.subtitle')}
      />
      {content}
    </>
  )
}

function initialPlantId(plants, requestedPlantId) {
  if (plants.some((plant) => String(plant.id) === requestedPlantId)) return requestedPlantId
  return plants.length === 1 ? String(plants[0].id) : ''
}

function ObservationForm({ plants, requestedPlantId }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = todayISO()

  // One id per submission: retries re-send it so the server can't save twice (NFR09).
  const [requestId, setRequestId] = useState(createRequestId)
  const [photo, setPhoto] = useState(null) // { file, previewUrl }
  const [photoError, setPhotoError] = useState(null)
  const previewUrlRef = useRef(null)
  const [progress, setProgress] = useState(null)
  const [failure, setFailure] = useState(null)

  // Release the preview's memory when the form goes away.
  useEffect(() => () => previewUrlRef.current && URL.revokeObjectURL(previewUrlRef.current), [])

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { plantId: initialPlantId(plants, requestedPlantId), observedOn: today, notes: '' },
  })
  const r = rules(t)

  // A different photo or plant makes it a different observation.
  const startNewSubmission = () => {
    setRequestId(createRequestId())
    setFailure(null)
  }

  const selectPhoto = (file) => {
    const problem = validatePhotoFile(file)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = problem ? null : URL.createObjectURL(file)
    setPhotoError(problem)
    setPhoto(problem ? null : { file, previewUrl: previewUrlRef.current })
    startNewSubmission()
  }

  const upload = async ({ plantId, observedOn, notes }) => {
    if (!photo) return
    setFailure(null)
    setProgress(0)
    try {
      const saved = await createObservation(
        plantId,
        { photo: photo.file, observedOn, notes: notes.trim(), clientRequestId: requestId },
        { onProgress: setProgress },
      )
      queryClient.setQueryData(queryKeys.observation(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: queryKeys.plants })
      toast.success(t('newObservation.saved'))
      navigate(`/observations/${saved.id}`)
    } catch (error) {
      setProgress(null)
      if (error.fields?.photo) setPhotoError(error.fields.photo)
      const shownOnFields = applyFieldErrors(error, setError, t, API_FIELDS) || Boolean(error.fields?.photo)
      if (!shownOnFields) setFailure(error)
    }
  }

  const onSubmit = (event) => {
    if (!photo && !photoError) setPhotoError('photo_required')
    return handleSubmit(upload)(event)
  }

  const photoMessage =
    photoError === 'photo_required'
      ? t('validation.photoRequired')
      : photoError && t(`fieldErrors.${photoError}`, { defaultValue: t('fieldErrors.invalid') })

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="p-6 sm:p-8">
        <form noValidate onSubmit={onSubmit} className="space-y-6">
          <SelectField
            label={t('newObservation.plant')}
            error={errors.plantId?.message}
            {...register('plantId', {
              required: t('validation.plantRequired'),
              onChange: startNewSubmission,
            })}
          >
            <option value="" disabled>
              {t('newObservation.choosePlant')}
            </option>
            {plants.map((plant) => (
              <option key={plant.id} value={String(plant.id)}>
                {plant.name}
              </option>
            ))}
          </SelectField>

          <PhotoPicker photo={photo} error={photoMessage} onSelect={selectPhoto} disabled={isSubmitting} />

          <TextField
            label={t('newObservation.observedOn')}
            type="date"
            min={EARLIEST_DATE}
            max={today}
            className="sm:max-w-xs"
            error={errors.observedOn?.message}
            {...register('observedOn', {
              required: t('validation.dateRequired'),
              validate: (value) => value <= todayISO() || t('validation.dateFuture'),
            })}
          />

          <TextAreaField
            label={t('newObservation.notes')}
            hint={t('newObservation.notesHint')}
            optional
            error={errors.notes?.message}
            {...register('notes', r.optionalText(limits.observationNotes))}
          />

          {progress !== null && (
            <ProgressBar
              value={progress}
              label={t('newObservation.uploadProgress')}
              caption={t('newObservation.uploading', { percent: progress })}
            />
          )}

          {failure && (
            <Alert
              tone="danger"
              title={t('newObservation.failedTitle')}
              action={
                isRetryable(failure) && (
                  <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
                    <RefreshCw />
                    {t('common.retry')}
                  </Button>
                )
              }
            >
              {errorMessage(t, failure)}
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => navigate(-1)} disabled={isSubmitting}>
              {t('newObservation.cancel')}
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {t('newObservation.submit')}
            </Button>
          </div>
        </form>
      </Card>

      <PhotoTips />
    </div>
  )
}
