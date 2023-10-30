import type { Array as YArray } from 'yjs';

export const updateFirstOfYArray = <T>(
  array: YArray<T>,
  p: (value: T) => boolean,
  update: (value: T) => T
) => {
  array.doc?.transact(() => {
    for (let i = 0; i < array.length; i++) {
      const ele = array.get(i);
      if (p(ele)) {
        array.delete(i);
        array.insert(i, [update(ele)]);
        return;
      }
    }
  });
};
