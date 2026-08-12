import { useCallback, useMemo, useState } from "react";

import { DATE_RANGE_PRESETS, resolveDateRange } from "../domain/dateRange";
import { hasActiveFilters, type SearchFilters } from "../domain/searchResult";

/**
 * What the filter sheet holds. The date lives as a preset id rather than a resolved window so the
 * chip can be labelled ("Past week") and the window re-derived whenever the selection changes.
 */
export type FilterSelection = {
  category?: string;
  datePresetId: string;
  hasText: boolean;
  folder?: string;
};

export const NO_FILTERS: FilterSelection = { datePresetId: "any", hasText: false };

/** One removable summary of an applied filter, for the chip row above the results. */
export type ActiveFilter = {
  key: keyof FilterSelection;
  label: string;
};

export function useSearchFilters() {
  const [selection, setSelection] = useState<FilterSelection>(NO_FILTERS);

  const apply = useCallback((next: FilterSelection) => setSelection(next), []);
  const clear = useCallback(() => setSelection(NO_FILTERS), []);

  /** Drops one filter from the chip row without opening the sheet. */
  const remove = useCallback((key: keyof FilterSelection) => {
    setSelection((current) => ({ ...current, [key]: NO_FILTERS[key] }));
  }, []);

  // Keyed on the selection, so the date window is resolved when a preset is applied rather than on
  // every render — see resolveDateRange for why that matters to the search cache.
  const filters = useMemo<SearchFilters>(
    () => ({
      category: selection.category,
      // Undefined rather than false: the native side treats the key's absence as "no constraint".
      hasText: selection.hasText || undefined,
      folder: selection.folder,
      ...resolveDateRange(selection.datePresetId)
    }),
    [selection]
  );

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const active: ActiveFilter[] = [];
    if (selection.category) active.push({ key: "category", label: selection.category });
    if (selection.datePresetId !== NO_FILTERS.datePresetId) {
      const preset = DATE_RANGE_PRESETS.find((candidate) => candidate.id === selection.datePresetId);
      if (preset) active.push({ key: "datePresetId", label: preset.label });
    }
    if (selection.hasText) active.push({ key: "hasText", label: "Has text" });
    if (selection.folder) active.push({ key: "folder", label: selection.folder });
    return active;
  }, [selection]);

  return {
    selection,
    filters,
    activeFilters,
    isFiltered: hasActiveFilters(filters),
    apply,
    clear,
    remove
  };
}
