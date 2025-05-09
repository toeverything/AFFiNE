import { BlockSuiteError } from '@blocksuite/global/exceptions';
import { Array as YArray, Map as YMap, Text as YText } from 'yjs';

import { Boxed } from '../boxed';
import { Text } from '../text';
import type { UnRecord } from '../types';
import type { CreateProxyOptions } from './types';
import { keyWithoutPrefix } from './utils';

type InitializeDataOptions = Pick<CreateProxyOptions, 'transform' | 'yMap'> & {
  getProxy: (source: UnRecord, root: UnRecord, path?: string) => UnRecord;
};

// Create default data object from yjs map
export const initializeData = ({
  getProxy,
  transform,
  yMap,
}: InitializeDataOptions): UnRecord => {
  const root: UnRecord = {};
  Array.from(yMap.entries()).forEach(([key, value]) => {
    if (key.startsWith('sys')) {
      return;
    }
    const keys = keyWithoutPrefix(key).split('.');
    const firstKey = keys[0];

    let finalData = value;
    if (Boxed.is(value)) {
      finalData = transform(firstKey, new Boxed(value), value);
    } else if (value instanceof YArray) {
      finalData = transform(firstKey, value.toArray(), value);
    } else if (value instanceof YText) {
      const next = new Text(value);
      finalData = transform(firstKey, next, value);
    } else if (value instanceof YMap) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.ReactiveProxyError,
        'flatY2Native does not support Y.Map as value of Y.Map'
      );
    } else {
      finalData = transform(firstKey, value, value);
    }
    const allLength = keys.length;
    void keys.reduce((acc: UnRecord, key, index) => {
      if (!acc[key] && index !== allLength - 1) {
        const path = keys.slice(0, index + 1).join('.');
        const data = getProxy({} as UnRecord, root, path);
        acc[key] = data;
      }
      if (index === allLength - 1) {
        acc[key] = finalData;
      }
      return acc[key] as UnRecord;
    }, root);
  });

  return root;
};
