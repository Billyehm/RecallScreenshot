const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/**
 * Human-readable byte size. Binary units, because this describes files and database pages as the
 * platform reports them rather than as a disk is marketed.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${Math.round(bytes)} B`;
}

/** Thousands separators for counts. Large libraries make bare digit runs hard to read. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "0";
}
