export function getText(
  val: string | string[] | undefined
): string | undefined {
  if (Array.isArray(val)) {
    if (val.length === 1) {
      return val[0];
    }
    return JSON.stringify(val);
  }
  return val;
}

export function tryParseArrayField(text: string): any[] | null {
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return null;
}
