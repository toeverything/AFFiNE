export function mapRealtimeEnum<T extends Record<string, string>>(
  enumType: T,
  value: string,
  label: string
): T[keyof T] {
  if (Object.prototype.hasOwnProperty.call(enumType, value)) {
    return enumType[value as keyof T];
  }
  throw new Error(`Unknown ${label}: ${value}`);
}
