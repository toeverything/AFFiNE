export function stableStringify(value: unknown): string {
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toJSON());
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => {
      const property = record[key];
      return (
        property !== undefined &&
        typeof property !== 'function' &&
        typeof property !== 'symbol'
      );
    })
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
