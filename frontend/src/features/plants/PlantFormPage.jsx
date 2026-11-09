import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { createPlant, getPlant, updatePlant } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button, ButtonLink } from '../../components/ui/Button'
import { LoadError, PageSpinner } from '../../components/ui/feedback'
import { TextAreaField, TextField } from '../../components/ui/fields'
import { Breadcrumb, Card, PageHeader } from '../../components/ui/layout'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { limits, optionalValue, rules } from '../../lib/validation'
import { PlantNotFound } from './PlantNotFound'

const API_FIELDS = { name: 'name', plant_type: 'plantType', location: 'location', notes: 'notes' }

/** Create (/plants/new) or edit (/plants/:plantId/edit) a plant profile. */
export function PlantFormPage() {
  const { t } = useTranslation()
  const { plantId } = useParams()
  const plant = useQuery({
    queryKey: queryKeys.plant(plantId),
    queryFn: () => getPlant(plantId),
    enabled: Boolean(plantId),
  })

  if (!plantId) return <PlantForm />
  if (plant.isPending) return <PageSpinner />
  if (plant.isError) {
    return plant.error.code === 'not_found' ? (
      <PlantNotFound />
    ) : (
      <LoadError message={errorMessage(t, plant.error)} onRetry={() => plant.refetch()} />
    )
  }
  return <PlantForm plant={plant.data} />
}

function PlantForm({ plant }) {
  const { t } = useTranslation()
  const isEdit = Boolean(plant)
  useDocumentTitle(isEdit ? t('plantForm.editTitle') : t('plantForm.createTitle'))
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [failure, setFailure] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: plant?.name ?? '',
      plantType: plant?.plant_type ?? '',
      location: plant?.location ?? '',
      notes: plant?.notes ?? '',
    },
  })
  const r = rules(t)

  const save = useMutation({
    mutationFn: (fields) => (isEdit ? updatePlant(plant.id, fields) : createPlant(fields)),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.plant(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: queryKeys.plants, exact: true })
      toast.success(isEdit ? t('plantForm.saved') : t('plantForm.created', { name: saved.name }))
      navigate(`/plants/${saved.id}`)
    },
  })

  const onSubmit = async (values) => {
    setFailure(null)
    try {
      await save.mutateAsync({
        name: values.name.trim(),
        plant_type: optionalValue(values.plantType),
        location: optionalValue(values.location),
        notes: optionalValue(values.notes),
      })
    } catch (error) {
      if (!applyFieldErrors(error, setError, t, API_FIELDS)) setFailure(error)
    }
  }

  const cancelTo = isEdit ? `/plants/${plant.id}` : '/dashboard'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t('nav.dashboard'), to: '/dashboard' },
              ...(isEdit ? [{ label: plant.name, to: `/plants/${plant.id}` }] : []),
              { label: isEdit ? t('plantForm.editTitle') : t('plantForm.createTitle') },
            ]}
          />
        }
        title={isEdit ? t('plantForm.editTitle') : t('plantForm.createTitle')}
        description={isEdit ? t('plantForm.editSubtitle', { name: plant.name }) : t('plantForm.createSubtitle')}
      />

      <Card className="p-6 sm:p-8">
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {failure && <Alert tone="danger">{errorMessage(t, failure)}</Alert>}
          <TextField
            label={t('plantForm.name')}
            hint={t('plantForm.nameHint')}
            error={errors.name?.message}
            {...register('name', r.requiredText(limits.plantName))}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              label={t('plantForm.plantType')}
              hint={t('plantForm.plantTypeHint')}
              optional
              error={errors.plantType?.message}
              {...register('plantType', r.optionalText(limits.plantType))}
            />
            <TextField
              label={t('plantForm.location')}
              hint={t('plantForm.locationHint')}
              optional
              error={errors.location?.message}
              {...register('location', r.optionalText(limits.location))}
            />
          </div>
          <TextAreaField
            label={t('plantForm.notes')}
            hint={t('plantForm.notesHint')}
            optional
            error={errors.notes?.message}
            {...register('notes', r.optionalText(limits.plantNotes))}
          />
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
            <ButtonLink to={cancelTo} variant="ghost">
              {t('plantForm.cancel')}
            </ButtonLink>
            <Button type="submit" loading={isSubmitting}>
              {isEdit
                ? isSubmitting
                  ? t('plantForm.saving')
                  : t('plantForm.save')
                : isSubmitting
                  ? t('plantForm.creating')
                  : t('plantForm.create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
