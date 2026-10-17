import type { OverviewItem, OverviewPin, OverviewSnapshot, ShellOverviewLayout } from '#shared/overview'
import { overviewPinLimit, overviewShellLimit, shellOverviewSchema } from '#shared/overview'
import { itemId } from '~/composables/useShellTrees'

const empty: ShellOverviewLayout = shellOverviewSchema.parse({})

/**
 * The Overview of one shell as the user arranged it (ADR 0032): positions
 * and sizes of its widgets, the widgets they hid and the values they pinned.
 * Stored with the user's preferences, per target and shell.
 */
export function useShellOverview (targetId: MaybeRefOrGetter<string>, shellKey: MaybeRefOrGetter<string>) {
  const preferences = usePreferences()

  const layout = computed<ShellOverviewLayout>(() => preferences.preferences.value.overviews[toValue(targetId)]?.[toValue(shellKey)] ?? empty)

  /** Changes this shell's Overview; the most recently changed shell moves to the end, older ones beyond the limit are dropped. */
  function change (edit: (current: ShellOverviewLayout) => ShellOverviewLayout) {
    const target = toValue(targetId)
    const key = toValue(shellKey)
    return preferences.update(current => {
      const shells = current.overviews[target] ?? {}
      const next = edit(structuredClone(toRaw(shells[key] ?? empty)))
      const kept = Object.entries(shells).filter(([entry]) => entry !== key).slice(-(overviewShellLimit - 1))
      current.overviews[target] = Object.fromEntries([...kept, [key, next]])
      return current
    })
  }

  function saveItems (items: OverviewItem[]) {
    return change(current => ({ ...current, items: items.map(item => ({ ...item })) }))
  }

  function setHidden (ids: string[]) {
    return change(current => ({ ...current, hidden: [...new Set(ids)] }))
  }

  /** The current positions, hidden widgets and pins, to undo a change. */
  function snapshot (): OverviewSnapshot {
    const { items, hidden, pins } = layout.value
    return structuredClone(toRaw({ items, hidden, pins }))
  }

  /** Puts back positions, hidden widgets and pins as they were. */
  function restore (saved: OverviewSnapshot) {
    return change(current => ({ ...current, items: saved.items, hidden: saved.hidden, pins: saved.pins }))
  }

  /** Forgets positions, sizes and hidden widgets; pinned values stay. */
  function reset () {
    return change(current => ({ ...current, items: [], hidden: [] }))
  }

  function isPinned (submodelKey: string, elementKey: string | null) {
    return elementKey !== null && layout.value.pins.some(pin => pin.submodelKey === submodelKey && pin.elementKey === elementKey)
  }

  function togglePin (pin: OverviewPin) {
    const pinned = isPinned(pin.submodelKey, pin.elementKey)
    return change(current => ({
      ...current,
      pins: pinned
        ? current.pins.filter(entry => entry.submodelKey !== pin.submodelKey || entry.elementKey !== pin.elementKey)
        : [...current.pins, pin],
    }))
  }

  /** No further value can be pinned (the stored list is limited). */
  const pinsFull = computed(() => layout.value.pins.length >= overviewPinLimit)

  return { layout, saveItems, setHidden, snapshot, restore, reset, isPinned, togglePin, pinsFull }
}

/** The widget ID of a pinned value. */
export function pinWidgetId (pin: Pick<OverviewPin, 'submodelKey' | 'elementKey'>): string {
  return `pin:${itemId(pin.submodelKey, pin.elementKey)}`
}

/** A numeric property whose value changed while auto-refresh re-read it (the Overview's live values). */
export interface LiveSignal {
  id: string
  submodelKey: string
  elementKey: string
  title: string
  submodel: string
  value: string | null
  /** The unit of its concept description, if any (MVP-6 plan, E6). */
  unit: string | null
  history: number[]
}
