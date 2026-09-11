const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Fractional index compatible with y-excalidraw `pos` strings.
 * Concurrent inserts sort stably; ties break on element id.
 */
export function generateKeyBetween(a?: string, b?: string): string {
  if (a != null && b != null && a >= b) {
    throw new Error('generateKeyBetween: a >= b');
  }
  if (a == null && b == null) return 'a0';
  if (b == null) return incrementKey(a);
  if (a == null) return midpoint('', b);
  return midpoint(a, b);
}

function incrementKey(key: string): string {
  const chars = key.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = DIGITS.indexOf(chars[i] ?? '');
    if (idx >= 0 && idx < DIGITS.length - 1) {
      chars[i] = DIGITS[idx + 1];
      return chars.join('');
    }
    chars[i] = DIGITS[0];
  }
  return `${key}0`;
}

function midpoint(a: string, b: string): string {
  let result = '';
  for (let i = 0; i < 48; i++) {
    const av = i < a.length ? DIGITS.indexOf(a[i] ?? '') : -1;
    const bv = i < b.length ? DIGITS.indexOf(b[i] ?? '') : DIGITS.length;
    const left = av < 0 ? 0 : av;
    if (bv - left > 1) {
      return result + DIGITS[Math.floor((left + bv) / 2)];
    }
    result += a[i] ?? '0';
  }
  return `${result}i`;
}
