import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Client } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { dataService } from '@/services/dataService'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Hint } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Building2, Plus, Pencil, Check, X, Archive, RotateCcw, Trash2, Search, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Admin-only screen. Employees and team leaders never reach this component;
// every write below also goes through an admin-guarded RPC, so hiding the UI is
// convenience, not the access control.
export const ClientsManager: React.FC = () => {
  const { user } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setClients(await dataService.getClientsWithUsage())
    } catch (err: any) {
      toast.error('Could not load clients', { description: err.message })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => c.name.toLowerCase().includes(q))
  }, [clients, search])

  const activeCount = clients.filter((c) => c.is_active).length

  if (!user) return null

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setIsAdding(true)
    setAddError(null)
    try {
      const created = await dataService.createClient(newName, user.role)
      toast.success(`${created.name} added to the client list`)
      setNewName('')
      load()
    } catch (err: any) {
      setAddError(err.message || 'Could not add the client.')
    } finally {
      setIsAdding(false)
    }
  }

  const handleRename = async (client: Client) => {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === client.name) {
      setEditingId(null)
      return
    }
    setBusyId(client.id)
    try {
      await dataService.updateClient(client.id, { name: trimmed }, user.role)
      toast.success(`Renamed to ${trimmed}`)
      setEditingId(null)
      load()
    } catch (err: any) {
      toast.error('Could not rename the client', { description: err.message })
    } finally {
      setBusyId(null)
    }
  }

  // Archiving keeps the client on every task log that already references it,
  // and only removes it from the task form dropdown.
  const handleToggleArchive = async (client: Client) => {
    setBusyId(client.id)
    try {
      await dataService.updateClient(client.id, { is_active: !client.is_active }, user.role)
      toast.success(
        client.is_active
          ? `${client.name} archived — it no longer appears in the task dropdown`
          : `${client.name} restored to the task dropdown`
      )
      load()
    } catch (err: any) {
      toast.error('Could not update the client', { description: err.message })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await dataService.deleteClient(deleteTarget.id, user.role)
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
      load()
    } catch (err: any) {
      toast.error('Could not delete the client', { description: err.message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Clients</CardTitle>
              <CardDescription className="text-xs">
                Only admins can change this list. Employees and team leaders pick from it when logging a task
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Add a client */}
          <form onSubmit={handleAdd} className="space-y-1.5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Add a client, e.g. Prem AI"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  if (addError) setAddError(null)
                }}
                aria-invalid={!!addError}
                aria-label="New client name"
                className="sm:flex-1"
              />
              <Button
                type="submit"
                disabled={isAdding || !newName.trim()}
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                {isAdding ? 'Adding…' : 'Add Client'}
              </Button>
            </div>
            {addError && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-rose-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {addError}
              </p>
            )}
          </form>

          {/* Search + counts */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white pl-9 text-xs"
              />
            </div>
            <p className="text-xs text-slate-500">
              {activeCount} active · {clients.length - activeCount} archived
            </p>
          </div>

          {/* List */}
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {isLoading ? (
              <p className="p-6 text-center text-xs text-slate-400">Loading clients…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                {clients.length === 0
                  ? 'No clients yet. Add the first one above.'
                  : 'No clients match that search.'}
              </p>
            ) : (
              filtered.map((client) => {
                const isEditing = editingId === client.id
                const isBusy = busyId === client.id
                const inUse = client.task_count ?? 0

                return (
                  <div
                    key={client.id}
                    className={cn(
                      'flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between',
                      !client.is_active && 'bg-slate-50/60'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Building2
                        className={cn('h-4 w-4 shrink-0', client.is_active ? 'text-blue-600' : 'text-slate-400')}
                      />

                      {isEditing ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleRename(client)
                            }
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          autoFocus
                          aria-label={`Rename ${client.name}`}
                          className="h-8 max-w-xs text-sm"
                        />
                      ) : (
                        <div className="min-w-0">
                          <span
                            className={cn(
                              'block truncate text-sm font-semibold',
                              client.is_active ? 'text-slate-800' : 'text-slate-500'
                            )}
                          >
                            {client.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {inUse === 0 ? 'Not used yet' : `${inUse} task log${inUse === 1 ? '' : 's'}`}
                          </span>
                        </div>
                      )}

                      {!client.is_active && !isEditing && (
                        <Badge variant="outline" className="shrink-0 text-[10px] text-slate-500">
                          Archived
                        </Badge>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleRename(client)}
                            disabled={isBusy}
                            className="h-8 gap-1 bg-blue-600 px-2.5 text-[11px] text-white hover:bg-blue-700"
                          >
                            <Check className="h-3 w-3" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                            disabled={isBusy}
                            className="h-8 w-8 p-0"
                            aria-label="Cancel rename"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(client.id)
                              setEditingName(client.name)
                            }}
                            disabled={isBusy}
                            className="h-8 gap-1 px-2.5 text-[11px]"
                          >
                            <Pencil className="h-3 w-3" /> Rename
                          </Button>

                          <Hint
                            label={
                              client.is_active
                                ? 'Hide from the task dropdown, keeping it on existing logs'
                                : 'Offer this client in the task dropdown again'
                            }
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleArchive(client)}
                              disabled={isBusy}
                              className={cn(
                                'h-8 gap-1 px-2.5 text-[11px]',
                                client.is_active
                                  ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              )}
                            >
                              {client.is_active ? (
                                <>
                                  <Archive className="h-3 w-3" /> Archive
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="h-3 w-3" /> Restore
                                </>
                              )}
                            </Button>
                          </Hint>

                          {/* Deleting is only offered while nothing references the client */}
                          <Hint
                            label={
                              inUse > 0
                                ? `Used by ${inUse} task log${inUse === 1 ? '' : 's'} — archive it instead`
                                : `Delete ${client.name}`
                            }
                          >
                            <span
                              tabIndex={inUse > 0 ? 0 : undefined}
                              className={inUse > 0 ? 'inline-flex cursor-not-allowed' : 'inline-flex'}
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteTarget(client)}
                                disabled={isBusy || inUse > 0}
                                aria-label={`Delete ${client.name}`}
                                className="h-8 w-8 border-slate-200 p-0 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          </Hint>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the client permanently. No task log references it, so nothing else changes. To keep a
              client for reporting but stop it appearing in the task dropdown, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
