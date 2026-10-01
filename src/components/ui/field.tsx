import * as React from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: React.ReactNode
  htmlFor?: string
  icon?: React.ReactNode
  required?: boolean
  optional?: boolean
  // Shown on the right of the label row (e.g. "Today only", running totals)
  aside?: React.ReactNode
  // Helper text under the control; replaced by the error when there is one
  description?: React.ReactNode
  error?: string | null
  className?: string
  children: React.ReactNode
}

// Label + control + helper/error text. Pass `aria-invalid={!!error}` to the control so it turns red too.
export const Field: React.FC<FieldProps> = ({
  label,
  htmlFor,
  icon,
  required,
  optional,
  aside,
  description,
  error,
  className,
  children,
}) => {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  return (
    <div className={cn('space-y-1.5', className)} data-invalid={error ? true : undefined}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold text-slate-700',
            error && 'text-rose-600'
          )}
        >
          {icon}
          {label}
          {required && <span className="text-rose-500">*</span>}
          {optional && <span className="text-xs font-normal text-slate-400">(optional)</span>}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      ) : (
        description && <p className="text-xs text-slate-500">{description}</p>
      )}
    </div>
  )
}
