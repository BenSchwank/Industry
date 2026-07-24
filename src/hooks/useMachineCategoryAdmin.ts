import { useQueryClient } from '@tanstack/react-query'
import { UNCATEGORIZED_LABEL } from '../lib/machineCategories'
import {
  forgetMachineFieldOption,
  renameMachineFieldOption,
} from '../lib/machineFieldOptions'
import { useSetMachinesCategory } from './useMachines'

type MachineCategoryRef = { id: string; category: string | null }

/**
 * Kategorien umbenennen / löschen (Maschinen + Vokabular).
 * Für Dropdown-Verwaltung in Liste, Filter und Stammdaten.
 */
export function useMachineCategoryAdmin() {
  const queryClient = useQueryClient()
  const setMachinesCategory = useSetMachinesCategory()

  async function renameCategory(
    machines: MachineCategoryRef[],
    from: string,
    to: string,
  ): Promise<{ ok: boolean; from: string; next: string; count: number }> {
    const next = to.trim()
    const prev = from.trim()
    if (!next || !prev) return { ok: false, from: prev, next, count: 0 }
    if (next.toLowerCase() === prev.toLowerCase()) {
      return { ok: true, from: prev, next, count: 0 }
    }

    const targets = machines.filter(
      (m) => (m.category ?? '').trim().toLowerCase() === prev.toLowerCase(),
    )
    if (targets.length > 0) {
      await setMachinesCategory.mutateAsync({
        ids: targets.map((m) => m.id),
        category: next,
      })
    }
    await renameMachineFieldOption('category', prev, next)
    void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    return { ok: true, from: prev, next, count: targets.length }
  }

  async function deleteCategory(
    machines: MachineCategoryRef[],
    category: string,
  ): Promise<{ ok: boolean; label: string; count: number }> {
    const label = category.trim()
    if (!label || label === UNCATEGORIZED_LABEL) {
      return { ok: false, label, count: 0 }
    }

    const targets = machines.filter(
      (m) => (m.category ?? '').trim().toLowerCase() === label.toLowerCase(),
    )
    if (
      !window.confirm(
        `Kategorie „${label}“ löschen?\n\n${
          targets.length > 0
            ? `${targets.length} Gerät(e) landen unter „${UNCATEGORIZED_LABEL}“.`
            : `Der leere Ordner wird entfernt.`
        }`,
      )
    ) {
      return { ok: false, label, count: 0 }
    }

    if (targets.length > 0) {
      await setMachinesCategory.mutateAsync({
        ids: targets.map((m) => m.id),
        category: null,
      })
    }
    await forgetMachineFieldOption('category', label)
    void queryClient.invalidateQueries({ queryKey: ['machine-field-options'] })
    return { ok: true, label, count: targets.length }
  }

  return {
    renameCategory,
    deleteCategory,
    isPending: setMachinesCategory.isPending,
  }
}
