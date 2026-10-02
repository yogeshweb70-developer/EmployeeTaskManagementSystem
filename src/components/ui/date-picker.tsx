import * as React from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarIcon, X } from 'lucide-react'
import { formatDateDDMMYYYY } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Dates travel through the app as YYYY-MM-DD strings, so convert at the edges.
// Parsing with an explicit midnight keeps the value in local time --
// `new Date('2026-10-09')` is parsed as UTC and can land on the previous day.
export function isoToDate(isoDate?: string | null): Date | undefined {
  return isoDate ? new Date(`${isoDate}T00:00:00`) : undefined
}

export function dateToIso(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface DatePickerProps {
  id?: string
  /** YYYY-MM-DD, or '' for no selection. */
  value: string
  onChange: (isoDate: string) => void
  placeholder?: string
  /** Earliest selectable date, YYYY-MM-DD. */
  min?: string
  /** Latest selectable date, YYYY-MM-DD. */
  max?: string
  disabled?: boolean
  invalid?: boolean
  /** Shows an inline clear button once a date is picked. */
  clearable?: boolean
  /** Rendered under the calendar, e.g. to explain a restricted range. */
  hint?: React.ReactNode
  /** Formats the trigger label; defaults to dd/mm/yyyy. */
  formatLabel?: (isoDate: string) => string
  'aria-describedby'?: string
  'aria-label'?: string
  className?: string
  triggerClassName?: string
}

// One calendar for the whole app: task entry, admin filters, team filters.
// Replaces `<input type="date">`, whose popup is the browser's own and differs
// between Chrome, Firefox and Safari.
export const DatePicker: React.FC<DatePickerProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  min,
  max,
  disabled,
  invalid,
  clearable,
  hint,
  formatLabel,
  'aria-describedby': describedBy,
  'aria-label': ariaLabel,
  className,
  triggerClassName,
}) => {
  const [open, setOpen] = React.useState(false)
  // Captured once so the fallback month cannot drift between renders
  const [todayDate] = React.useState(() => new Date())

  const minDate = isoToDate(min)
  const maxDate = isoToDate(max)
  const selected = isoToDate(value)

  // react-day-picker takes one matcher; only pass the bounds that exist
  const disabledMatcher =
    minDate && maxDate
      ? { before: minDate, after: maxDate }
      : minDate
        ? { before: minDate }
        : maxDate
          ? { after: maxDate }
          : undefined

  const label = value ? (formatLabel ? formatLabel(value) : formatDateDDMMYYYY(value)) : placeholder

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-label={ariaLabel}
            className={cn(
              'h-10 w-full justify-start gap-2 border-input bg-white px-3 text-sm font-normal hover:bg-slate-50',
              value ? 'text-slate-800' : 'text-slate-500',
              clearable && value && 'pr-9',
              'aria-[invalid=true]:border-rose-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-500/20',
              triggerClassName
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? maxDate ?? todayDate}
            onSelect={(date) => {
              if (!date) return
              onChange(dateToIso(date))
              setOpen(false)
            }}
            disabled={disabledMatcher}
            startMonth={minDate}
            endMonth={maxDate}
            autoFocus
          />
          {hint && <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">{hint}</p>}
        </PopoverContent>
      </Popover>

      {/* Sits outside the trigger so clicking it clears instead of opening */}
      {clearable && value && !disabled && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear date"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
