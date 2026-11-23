import { on } from '@blocksuite/affine-shared/utils';

export function onClickOutside(target: HTMLElement, fn: () => void) {
  return on(document, 'click', (evt: MouseEvent) => {
    if (target.contains(evt.target as Node)) return;

    fn();

    return;
  });
}

export function cloneDeep<T>(obj: T): T {
  const seen = new WeakMap();

  const clone = (val: unknown) => {
    if (typeof val !== 'object' || val === null) return val;
    if (seen.has(val)) return seen.get(val);

    const copy = Array.isArray(val) ? [] : {};

    seen.set(val, copy);

    Object.keys(val).forEach(key => {
      // @ts-expect-error deep clone
      copy[key] = clone(val[key]);
    });

    return copy;
  };

  return clone(obj);
}
