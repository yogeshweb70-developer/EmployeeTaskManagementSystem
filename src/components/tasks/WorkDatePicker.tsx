import React from 'react'
import { DatePicker } from '@/components/ui/date-picker'
import {
  MAX_BACKDATE_DAYS,
  describeWorkDate,
  getEarliestWorkDateString,
  getTodayDateString,
} from '@/lib/utils'

interface WorkDatePickerProps {
  id?: string
  /** YYYY-MM-DD */
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
  invalid?: boolean
  'aria-describedby'?: string
  /** How many days before today may still be selected. */
  daysBack?: number
}

// The shared DatePicker, pinned to the task backdating window: today and the
// previous `daysBack` days, never the future.
export const WorkDatePicker: React.FC<WorkDatePickerProps> = ({
  id,
  value,
  onChange,
  disabled,
  invalid,
  'aria-describedby': describedBy,
  daysBack = MAX_BACKDATE_DAYS,
}) => (
  <DatePicker
    id={id}
    value={value}
    onChange={onChange}
    disabled={disabled}
    invalid={invalid}
    aria-describedby={describedBy}
    min={getEarliestWorkDateString(daysBack)}
    max={getTodayDateString()}
    placeholder="Pick a date"
    // "Today (09/10/2026)" / "Yesterday (08/10/2026)" reads better than a bare date
    formatLabel={describeWorkDate}
    hint={`Today or the previous ${daysBack} days. Future dates are not allowed.`}
  />
)
