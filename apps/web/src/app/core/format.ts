/**
 * Amounts are integer minor units (e.g. cents/kobo).
 * Format as a major-unit value with 2 decimals. 1000 -> "10.00", -1500 -> "-15.00".
 */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.trunc(abs / 100);
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${sign}${major}.${cents}`;
}

/** Format an ISO timestamp for display. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
