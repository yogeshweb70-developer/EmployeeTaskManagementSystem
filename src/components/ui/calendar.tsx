import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// react-day-picker v10 styled to match the rest of the app. The class keys come
// from the library's UI enum (root, month_caption, day_button, ...), so they
// differ from the v8 names used by older shadcn snippets.
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex w-full flex-col gap-4',
        month_caption: 'flex h-9 items-center justify-center px-9',
        caption_label: 'text-sm font-semibold text-slate-800',

        nav: 'absolute inset-x-0 top-0 flex h-9 items-center justify-between px-1',
        button_previous: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white',
          'text-slate-600 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40'
        ),
        button_next: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white',
          'text-slate-600 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40'
        ),

        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[11px] font-medium uppercase tracking-wide text-slate-400',
        weeks: '',
        week: 'mt-1 flex w-full',

        day: 'relative h-9 w-9 p-0 text-center text-sm',
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md font-normal text-slate-700 transition-colors',
          'hover:bg-blue-50 hover:text-blue-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:pointer-events-none disabled:text-slate-300 disabled:line-through'
        ),
        selected: '[&>button]:bg-blue-600 [&>button]:font-semibold [&>button]:text-white [&>button:hover]:bg-blue-700 [&>button:hover]:text-white',
        today: '[&>button]:font-semibold [&>button]:text-blue-700 [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-blue-200',
        outside: '[&>button]:text-slate-300',
        disabled: '[&>button]:text-slate-300 [&>button]:line-through',
        hidden: 'invisible',

        dropdowns: 'flex items-center gap-2',
        dropdown_root: 'relative',
        dropdown:
          'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring',

        footer: 'pt-3 text-xs text-slate-500',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" {...chevronProps} />
          ) : (
            <ChevronRight className="h-4 w-4" {...chevronProps} />
          ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
