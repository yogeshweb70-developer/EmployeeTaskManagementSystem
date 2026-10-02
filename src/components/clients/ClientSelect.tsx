import React, { useEffect, useState } from 'react'
import { Client } from '@/types'
import { dataService } from '@/services/dataService'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ClientSelectProps {
  id?: string
  value: string
  onChange: (clientId: string) => void
  disabled?: boolean
  /** Rendered read-only, for the view mode of the task modal. */
  readOnly?: boolean
  /**
   * Keep this client in the list even when it is archived, so editing an old
   * task log still shows the client it was recorded against instead of
   * silently falling back to nothing.
   */
  includeClientId?: string | null
  /** Marks the trigger invalid when the surrounding field has an error. */
  invalid?: boolean
  'aria-describedby'?: string
  className?: string
}

// Everyone can read the client list; only admins can change it, which is
// enforced by RLS and the admin RPCs rather than by hiding this control.
export const ClientSelect: React.FC<ClientSelectProps> = ({
  id,
  value,
  onChange,
  disabled,
  readOnly,
  includeClientId,
  invalid,
  'aria-describedby': describedBy,
  className,
}) => {
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const active = await dataService.getClients(true)
        if (cancelled) return

        // The task's own client may have been archived since it was logged
        if (includeClientId && !active.some((c) => c.id === includeClientId)) {
          const all = await dataService.getClients(false)
          if (cancelled) return
          const archived = all.find((c) => c.id === includeClientId)
          setClients(archived ? [...active, archived] : active)
        } else {
          setClients(active)
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Could not load clients:', err)
          setLoadError(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [includeClientId])

  const selected = clients.find((c) => c.id === value)

  if (readOnly) {
    return (
      <div className="flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-800">
        {selected ? (
          <>
            <span className="truncate">{selected.name}</span>
            {!selected.is_active && <span className="text-xs text-slate-400">(archived)</span>}
          </>
        ) : (
          // Logs created before Client became mandatory have none
          <span className="text-slate-400">No client recorded</span>
        )}
      </div>
    )
  }

  const placeholder = isLoading
    ? 'Loading clients…'
    : loadError
      ? 'Could not load clients'
      : clients.length === 0
        ? 'No clients available — ask an admin'
        : 'Select a client'

  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled || isLoading || clients.length === 0}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={className}
      >
        {/* Radix forbids an item with an empty value, so the unselected state
            is the placeholder rather than a "none" option. */}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent>
        <SelectGroup>
          <SelectLabel>Clients</SelectLabel>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
              {!client.is_active && <span className="ml-1.5 text-xs text-slate-400">(archived)</span>}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
