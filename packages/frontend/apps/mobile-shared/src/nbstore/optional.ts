export function normalizeNativeOptional<T>(value: T | null | undefined) {
  return value ?? null;
}
