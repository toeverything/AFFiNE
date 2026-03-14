/**
 * Returns the number of calendar days between two dates.
 * Extracts the local-timezone year/month/day from each Date,
 * then uses Date.UTC to compute a pure integer day difference
 * that is immune to DST transitions.
 */
export function calendarDaysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return (utcB - utcA) / 86_400_000;
}
