export function isPureObject(value: unknown): value is object {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]' &&
    [Object, undefined, null].some(x => x === value.constructor)
  );
}
