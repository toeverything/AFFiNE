export const RELATIVE_ASC = [
  'last30',
  'last7',
  'yesterday',
  'today',
  'tomorrow',
  'next7',
  'next30',
] as const;
export const RELATIVE_DESC = [...RELATIVE_ASC].reverse();

/**
 * Sorts relative date keys in chronological order
 */
export function sortRelativeKeys(a: string, b: string, asc: boolean): number {
  const order: readonly string[] = asc ? RELATIVE_ASC : RELATIVE_DESC;
  const idxA = order.indexOf(a);
  const idxB = order.indexOf(b);

  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return asc ? 1 : -1;
  if (idxB !== -1) return asc ? -1 : 1;

  return 0; // Both not found
}

/**
 * Sorts numeric date keys (timestamps)
 */
export function sortNumericKeys(a: string, b: string, asc: boolean): number {
  const na = Number(a);
  const nb = Number(b);

  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return asc ? na - nb : nb - na;
  }

  return 0; // Not both numeric
}

export function compareDateKeys(mode: string | undefined, asc: boolean) {
  return (a: string, b: string) => {
    if (mode === 'date-relative') {
      // Try relative key sorting first
      const relativeResult = sortRelativeKeys(a, b, asc);
      if (relativeResult !== 0) return relativeResult;

      // Try numeric sorting second
      const numericResult = sortNumericKeys(a, b, asc);
      if (numericResult !== 0) return numericResult;

      // Fallback to lexicographic order for mixed cases
      return asc ? a.localeCompare(b) : b.localeCompare(a);
    }

    // Standard numeric/lexicographic comparison for other date modes
    return (
      sortNumericKeys(a, b, asc) ||
      (asc ? a.localeCompare(b) : b.localeCompare(a))
    );
  };
}
