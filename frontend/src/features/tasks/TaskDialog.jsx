import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListPlus, Pencil } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { listPlants } from '../../api/plants'
import { queryKeys } from '../../api/queryKeys'
import { createTask, updateTask } from '../../api/tasks'
import { SectionSpinner } from '../../components/ui/feedback'
import { SelectField, TextAreaField, TextField } from '../../components/ui/fields'
import { FormDialog } from '../../components/ui/FormDialog'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { limits, optionalValue, rules } from '../../lib/validation'
import { refreshTaskViews } from './taskState'

const API_FIELDS = { title: 'title', due_on: 'dueOn', notes: 'notes' }

/**
 * Adds a task (US18), or edits `task`. `plantId` fixes the plant; without it the grower
 * chooses one. `defaults` pre-fills a task from a guidance step: { title, pestKey, observationId }.
 */
export function TaskDialog({ open, ...props }) {
  // Mounted only while open, so each opening starts from fresh values.
  return open ? <TaskForm {...props} /> : null
}

function TaskForm({ onClose, task, plantId, defaults = {} }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = Boolean(task)
  const choosePlant = !isEdit && !plantId
  const plants = useQuery({ queryKey: queryKeys.plants, queryFn: listPlants, enabled: choosePlant })
  const r = rules(t)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: {
      plantId: plantId ? String(plantId) : (defaults.plantId ?? ''),
      title: task?.title ?? defaults.title ?? '',
      dueOn: task?.due_on ?? '',
      notes: task?.notes ?? '',
    },
  })

  const save = useMutation({
    mutationFn: ({ plantId: chosen, title, dueOn, notes }) => {
      const fields = { title: title.trim(), due_on: dueOn || null, notes: optionalValue(notes) }
      if (isEdit) return updateTask(task.id, fields)
      return createTask(chosen, {
        ...fields,
        // A step added from an observation's guide stays linked to it, on that plant only.
        observation_id: String(chosen) === String(defaults.plantId) ? (defaults.observationId ?? null) : null,
        pest_key: defaults.pestKey ?? null,
      })
    },
    onSuccess: (saved) => {
      refreshTaskViews(queryClient)
      toast.success(isEdit ? t('tasks.saved') : t('tasks.added', { plant: saved.plant_name }))
      onClose()
    },
    onError: (error) => applyFieldErrors(error, setError, t, API_FIELDS),
  })

  const placedOnField = Object.keys(save.error?.fields ?? {}).some((field) => API_FIELDS[field])
  const noPlants = choosePlant && plants.data?.length === 0

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={handleSubmit((values) => save.mutate(values))}
      icon={isEdit ? Pencil : ListPlus}
      title={isEdit ? t('tasks.editTitle') : t('tasks.addTitle')}
      description={isEdit ? null : t('tasks.addIntro')}
      submitLabel={save.isPending ? t('tasks.saving') : isEdit ? t('tasks.save') : t('tasks.add')}
      submitting={save.isPending}
      error={save.isError && !placedOnField ? errorMessage(t, save.error) : null}
    >
      {choosePlant &&
        (plants.isPending ? (
          <SectionSpinner />
        ) : noPlants ? (
          <p className="text-sm text-muted">
            {t('tasks.noPlants')}{' '}
            <Link to="/plants/new" className="font-medium text-forest-700 underline underline-offset-4">
              {t('newObservation.addPlant')}
            </Link>
          </p>
        ) : (
          <SelectField
            label={t('tasks.plant')}
            error={errors.plantId?.message}
            {...register('plantId', { required: t('tasks.plantRequired') })}
          >
            <option value="">{t('newObservation.choosePlant')}</option>
            {plants.data?.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name}
              </option>
            ))}
          </SelectField>
        ))}
      <TextField
        label={t('tasks.title')}
        error={errors.title?.message}
        {...register('title', r.requiredText(limits.taskTitle))}
      />
      <TextField
        type="date"
        label={t('tasks.dueOn')}
        hint={t('tasks.dueOnHint')}
        optional
        error={errors.dueOn?.message}
        {...register('dueOn')}
      />
      <TextAreaField
        label={t('tasks.notes')}
        optional
        rows={2}
        error={errors.notes?.message}
        {...register('notes', r.optionalText(limits.taskNotes))}
      />
    </FormDialog>
  )
}
