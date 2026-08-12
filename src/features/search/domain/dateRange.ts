/** A named relative window, resolved against "now" at the moment a search runs. */
export type DateRangePreset = {
  id: string;
  label: string;
  /** Length of the window in days; 0 means no date constraint. */
  days: number;
};

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { id: "any", label: "Any time", days: 0 },
  { id: "week", label: "Past week", days: 7 },
  { id: "month", label: "Past month", days: 30 },
  { id: "quarter", label: "Past 3 months", days: 90 },
  { id: "year", label: "Past year", days: 365 }
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns a preset into the half-open window the native ranker expects.
 *
 * Both bounds snap to midnight, and the upper bound is the *end* of today so an image taken minutes
 * ago still falls inside it. Snapping is what makes the window usable as part of the search cache
 * key: an unrounded "now" would differ on every render, so every render would miss the cache and
 * start another index scan.
 *
 * Call this when a preset is applied rather than on every render — a window resolved once stays
 * correct all day, and re-resolves the next time the filter is touched.
 */
export function resolveDateRange(presetId: string, now = Date.now()): { fromMillis?: number; toMillis?: number } {
  const preset = DATE_RANGE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset || preset.days <= 0) return {};

  const endOfToday = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
  return { fromMillis: endOfToday - preset.days * DAY_MS, toMillis: endOfToday };
}
