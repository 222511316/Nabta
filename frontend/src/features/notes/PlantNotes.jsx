import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { createNote, deleteNote, listNotes, updateNote } from '../../api/notes'
import { queryKeys } from '../../api/queryKeys'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { LoadError, SectionSpinner } from '../../components/ui/feedback'
import { TextAreaField, TextField } from '../../components/ui/fields'
import { Card } from '../../components/ui/layout'
import { applyFieldErrors, errorMessage } from '../../lib/apiErrors'
import { cx } from '../../lib/cx'
import { formatDate, todayISO } from '../../lib/dates'
import { limits, rules } from '../../lib/validation'

const API_FIELDS = { noted_on: 'notedOn', body: 'body' }

/**
 * The Notes tab on a plant's page (US19): the grower's own dated notes, newest first,
 * kept apart from the notes on each photo.
 */
export function PlantNotes({ plant }) {
  const { t } = useTranslation()
  const notes = useQuery({ queryKey: queryKeys.plantNotes(plant.id), queryFn: () => listNotes(plant.id) })

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <NoteForm plant={plant} />
      </Card>
      {notes.isPending ? (
        <SectionSpinner />
      ) : notes.isError ? (
        <LoadError message={errorMessage(t, notes.error)} onRetry={() => notes.refetch()} />
      ) : notes.data.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-sage-300 bg-white/60 px-5 py-6 text-muted">
          <NotebookPen className="size-5 shrink-0 text-sage-600" />
          <p>{t('notes.empty')}</p>
        </div>
      ) : (
        <Card as="ol" aria-label={t('notes.listLabel', { plant: plant.name })} className="divide-y divide-line">
          {notes.data.map((note) => (
            <NoteRow key={note.id} note={note} plant={plant} />
          ))}
        </Card>
      )}
    </div>
  )
}

/** Adds a note, or edits `note` in place. */
function NoteForm({ plant, note, onDone }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const r = rules(t)
  const today = todayISO()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { notedOn: note?.noted_on ?? today, body: note?.body ?? '' } })

  const save = useMutation({
    mutationFn: ({ notedOn, body }) => {
      const fields = { notedOn, body: body.trim() }
      return note ? updateNote(note.id, fields) : createNote(plant.id, fields)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plantNotes(plant.id) })
      queryClient.invalidateQueries({ queryKey: ['search'] })
      toast.success(note ? t('notes.saved') : t('notes.added'))
      if (note) onDone()
      else reset({ notedOn: todayISO(), body: '' })
    },
    onError: (error) => applyFieldErrors(error, setError, t, API_FIELDS),
  })

  const placedOnField = Object.keys(save.error?.fields ?? {}).some((field) => API_FIELDS[field])
  return (
    <form noValidate onSubmit={handleSubmit((values) => save.mutate(values))} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <TextField
          type="date"
          label={t('notes.date')}
          max={today}
          error={errors.notedOn?.message}
          {...register('notedOn', {
            required: t('validation.required'),
            validate: (value) => value <= today || t('validation.dateFuture'),
          })}
        />
        <TextAreaField
          label={note ? t('notes.note') : t('notes.newNote')}
          hint={note ? null : t('notes.hint')}
          rows={note ? 3 : 2}
          error={errors.body?.message}
          {...register('body', r.requiredText(limits.plantNote))}
        />
      </div>
      {save.isError && !placedOnField && <Alert tone="danger">{errorMessage(t, save.error)}</Alert>}
      <div className="flex justify-end gap-2">
        {note && (
          <Button variant="secondary" size="sm" onClick={onDone} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" size={note ? 'sm' : 'md'} loading={save.isPending}>
          {note ? t('notes.save') : t('notes.add')}
        </Button>
      </div>
    </form>
  )
}

function NoteRow({ note, plant }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const date = formatDate(note.noted_on, i18n.language)

  const remove = useMutation({
    mutationFn: () => deleteNote(note.id),
    onSuccess: () => {
      setDeleting(false)
      toast.success(t('notes.deleted'))
      queryClient.invalidateQueries({ queryKey: queryKeys.plantNotes(plant.id) })
      queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })

  const iconButton = 'flex size-9 items-center justify-center rounded-lg text-muted transition-colors'
  return (
    <li className="px-4 py-4 sm:px-5">
      {editing ? (
        <NoteForm plant={plant} note={note} onDone={() => setEditing(false)} />
      ) : (
        <article className="flex gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-forest-700">
              <time dateTime={note.noted_on}>{date}</time>
            </h3>
            <p className="mt-1 leading-relaxed whitespace-pre-line text-ink">{note.body}</p>
          </div>
          <div className="-me-2 flex shrink-0 items-start">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t('notes.edit', { date })}
              className={cx(iconButton, 'hover:bg-sage-50 hover:text-forest-800')}
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              aria-label={t('notes.delete', { date })}
              className={cx(iconButton, 'hover:bg-danger-50 hover:text-danger-600')}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </article>
      )}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        confirming={remove.isPending}
        title={t('notes.deleteTitle', { date })}
        confirmLabel={t('notes.deleteConfirm')}
      >
        {t('notes.deleteBody')}
        {remove.isError && <span className="mt-3 block text-danger-600">{errorMessage(t, remove.error)}</span>}
      </ConfirmDialog>
    </li>
  )
}
