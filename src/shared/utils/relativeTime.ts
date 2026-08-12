const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short "how long ago" label for list rows and card subtitles. */
export function formatRelativeTime(timestamp: number, now = Date.now()) {
  const elapsed = now - timestamp;

  if (elapsed < HOUR) return `${Math.max(1, Math.floor(elapsed / MINUTE))} mins ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hours ago`;
  return `${Math.floor(elapsed / DAY)} days ago`;
}

/**
 * Heading for a date-grouped gallery: "Today", "Yesterday", "August 2026".
 *
 * Recent days are named because that is how someone looks for a screenshot they just took; anything
 * older collapses to its month, which keeps the number of headings bounded as the library grows.
 * The year is dropped within the current year to keep headings short.
 */
export function formatDateGroup(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const today = startOfDay(now);
  const days = Math.floor((today - startOfDay(timestamp)) / DAY);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "long" } : { month: "long", year: "numeric" });
}

/** Local midnight, so grouping follows calendar days rather than 24-hour windows. */
function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
