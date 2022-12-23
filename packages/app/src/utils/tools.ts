/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-types
export function debounce(fn: Function, timeout: number) {
  let timeoutId: any;

  return function (this: any) {
    clearTimeout(timeoutId);
    // eslint-disable-next-line prefer-rest-params
    timeoutId = setTimeout(() => fn.apply(this, arguments), timeout);
  };
}
