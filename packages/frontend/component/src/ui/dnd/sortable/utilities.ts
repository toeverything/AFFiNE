import { useMemo } from 'react';

import type { ClientRect, Disabled, RectMap, UniqueIdentifier } from './types';

let ids: Record<string, number> = {};

export function useUniqueId(prefix: string, value?: string) {
  return useMemo(() => {
    if (value) {
      return value;
    }

    const id = ids[prefix] == null ? 0 : ids[prefix] + 1;
    ids[prefix] = id;

    return `${prefix}-${id}`;
  }, [prefix, value]);
}

/**
 * Move an array item to a different position. Returns a new array with the item moved to the new position.
 */
export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const newArray = array.slice();
  newArray.splice(
    to < 0 ? newArray.length + to : to,
    0,
    newArray.splice(from, 1)[0]
  );

  return newArray;
}

export function getSortedRects(items: UniqueIdentifier[], rects: RectMap) {
  return items.reduce<ClientRect[]>(
    (accumulator, id, index) => {
      const rect = rects.get(id);

      if (rect) {
        accumulator[index] = rect;
      }

      return accumulator;
    },
    Array.from({ length: items.length })
  );
}

export function itemsEqual(a: UniqueIdentifier[], b: UniqueIdentifier[]) {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export function normalizeDisabled(disabled: boolean | Disabled): Disabled {
  if (typeof disabled === 'boolean') {
    return {
      draggable: disabled,
      droppable: disabled,
    };
  }

  return disabled;
}
