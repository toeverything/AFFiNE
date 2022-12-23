export function debounce(fn: Function, timeout: number) {
  let timeoutId: any;

  return function (this: any) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, arguments), timeout);
  };
}
