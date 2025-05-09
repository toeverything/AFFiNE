import { isPureObject } from '../is-pure-object';
import { native2Y } from '../native-y';
import type { CreateProxyOptions } from './types';
import {
  bindOnChangeIfNeed,
  getFirstKey,
  keyWithoutPrefix,
  keyWithPrefix,
} from './utils';

type YMapOptions = Pick<
  CreateProxyOptions,
  'shouldByPassYjs' | 'yMap' | 'initialized' | 'onChange'
> & {
  fullPath: string;
  value: unknown;
};

export function yMapUpdater({
  shouldByPassYjs,
  yMap,
  initialized,
  onChange,
  fullPath,
  value,
}: YMapOptions) {
  const firstKey = getFirstKey(fullPath);
  if (shouldByPassYjs()) {
    return;
  }
  const list: Array<() => void> = [];
  yMap.forEach((_, key) => {
    if (initialized() && keyWithoutPrefix(key).startsWith(fullPath)) {
      yMap.delete(key);
    }
  });
  const run = (obj: object, basePath: string) => {
    Object.entries(obj).forEach(([key, value]) => {
      const fullPath = basePath ? `${basePath}.${key}` : key;
      if (isPureObject(value)) {
        run(value, fullPath);
      } else {
        list.push(() => {
          bindOnChangeIfNeed(value, () => {
            onChange?.(firstKey, true);
          });
          yMap.set(keyWithPrefix(fullPath), native2Y(value));
        });
      }
    });
  };
  run(value as object, fullPath);
  if (list.length && initialized()) {
    yMap.doc?.transact(
      () => {
        list.forEach(fn => fn());
      },
      { proxy: true }
    );
  }
}
