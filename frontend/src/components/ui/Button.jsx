import { Link } from 'react-router'
import { cx } from '../../lib/cx'
import { Spinner } from './Spinner'

const variants = {
  primary: 'bg-forest-700 text-white shadow-sm hover:bg-forest-600 active:bg-forest-800',
  secondary:
    'border border-line-strong bg-white text-forest-800 shadow-xs hover:border-forest-400 hover:bg-forest-50',
  ghost: 'text-forest-700 hover:bg-forest-50',
  danger: 'bg-danger-600 text-white shadow-sm hover:bg-danger-700',
  dangerGhost: 'text-danger-600 hover:bg-danger-50',
}

const sizes = {
  md: 'min-h-11 px-5 text-[0.95rem]',
  sm: 'min-h-10 px-3.5 text-sm',
  lg: 'min-h-12 px-6 text-base',
}

function buttonClasses({ variant = 'primary', size = 'md', className } = {}) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-150 select-none active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-[1.1em] [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    className,
  )
}

export function Button({
  variant,
  size,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

/** A router link styled as a button. */
export function ButtonLink({ variant, size, className, ...props }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />
}
