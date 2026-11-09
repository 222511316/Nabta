import { ScanSearch, Sprout } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ROLES } from '../../auth/useRoleParam'
import { cx } from '../../lib/cx'

const ICONS = { grower: Sprout, specialist: ScanSearch }

/**
 * Grower / Plant specialist, as a radio group (arrow keys move between them).
 * A white tab slides to the chosen role. `detailed` adds each role's description.
 */
export function RoleSelector({ value, onChange, legend, detailed = false }) {
  const { t } = useTranslation()
  const name = useId()

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className="relative grid grid-cols-2 rounded-xl bg-sage-100 p-1">
        <span
          aria-hidden="true"
          className={cx(
            'absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-card',
            'transition-[inset-inline-start] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            value === 'specialist' ? 'start-1/2' : 'start-1',
          )}
        />
        {ROLES.map((role) => {
          const Icon = ICONS[role]
          const checked = value === role
          return (
            <label
              key={role}
              className={cx(
                'relative flex cursor-pointer gap-3 rounded-lg px-3 transition-colors duration-200',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-forest-500',
                detailed ? 'items-start py-3' : 'items-center justify-center py-2.5',
                checked ? 'text-forest-800' : 'text-muted hover:text-forest-700',
              )}
            >
              <input
                type="radio"
                name={name}
                value={role}
                checked={checked}
                onChange={() => onChange(role)}
                className="sr-only"
              />
              <Icon
                className={cx(
                  'size-5 shrink-0 transition-transform duration-300',
                  checked && 'scale-110 text-forest-600',
                  detailed && 'mt-0.5',
                )}
              />
              <span className="min-w-0">
                <span className="block font-medium">{t(`roles.${role}.title`)}</span>
                {detailed && (
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    {t(`roles.${role}.description`)}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
