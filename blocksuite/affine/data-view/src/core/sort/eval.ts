import type { VariableRef } from '../expression/types.js';
import type { ArrayTypeInstance } from '../logical/composite-type.js';
import type { DataTypeOf } from '../logical/data-type.js';
import { t } from '../logical/index.js';
import type { TypeInstance } from '../logical/type.js';
import { typeSystem } from '../logical/type-system.js';
import type { Row, SingleView } from '../view-manager/index.js';
import type { Sort } from './types.js';

export const Compare = {
  GT: 'GT',
  LT: 'LT',
} as const;
export type CompareType = keyof typeof Compare | number;
const evalRef = (
  view: SingleView,
  ref: VariableRef
):
  | ((row: Row) => {
      value: unknown;
      ttype?: TypeInstance;
    })
  | undefined => {
  const ttype = view.propertyGetOrCreate(ref.name).dataType$.value;
  return row => ({
    value: view.cellGetOrCreate(row.rowId, ref.name).jsonValue$.value,
    ttype,
  });
};
const compareList = <T>(
  listA: T[],
  listB: T[],
  compare: (a: T, b: T) => CompareType
) => {
  let i = 0;
  while (i < listA.length && i < listB.length) {
    const a = listA[i];
    const b = listB[i];
    if (a == null || b == null) {
      continue;
    }
    const result = compare(a, b);
    if (result !== 0) {
      return result;
    }
    i++;
  }
  return 0;
};
const compareString = (a: unknown, b: unknown): CompareType => {
  const strA = String(a ?? '');
  const strB = String(b ?? '');

  if (strA === '' && strB !== '') {
    return Compare.GT; // Empty strings come last
  }
  if (strA !== '' && strB === '') {
    return Compare.LT; // Empty strings come last
  }
  if (strA === '' && strB === '') {
    return 0; // Both empty, equal
  }

  const listA = strA.split('.');
  const listB = strB.split('.');
  return compareList(listA, listB, (a, b) => {
    const lowA = String(a).toLowerCase(); // Ensure 'a' and 'b' from split are strings too
    const lowB = String(b).toLowerCase();

    const numberA = Number.parseInt(lowA);
    const numberB = Number.parseInt(lowB);
    const aIsNaN = Number.isNaN(numberA);
    const bIsNaN = Number.isNaN(numberB);

    if (aIsNaN && !bIsNaN) {
      return 1; // Non-numeric part comes after numeric part
    }
    if (!aIsNaN && bIsNaN) {
      return -1; // Numeric part comes before non-numeric part
    }
    if (!aIsNaN && !bIsNaN && numberA !== numberB) {
      return numberA - numberB; // Numeric comparison for numeric parts
    }

    return lowA.localeCompare(lowB); // Lexicographical comparison for string parts
  });
};
const compareNumber = (a: unknown, b: unknown) => {
  if (a == null) {
    return Compare.GT;
  }
  if (b == null) {
    return Compare.LT;
  }
  return Number(a) - Number(b);
};
const compareBoolean = (a: unknown, b: unknown) => {
  a = Boolean(a);
  b = Boolean(b);
  const bA = a ? 1 : 0;
  const bB = b ? 1 : 0;
  return bA - bB;
};
const compareArray = (type: ArrayTypeInstance, a: unknown, b: unknown) => {
  if (!Array.isArray(a)) {
    return Compare.GT;
  }
  if (!Array.isArray(b)) {
    return Compare.LT;
  }
  return compareList(a, b, (a, b) => {
    return compare(type.element, a, b);
  });
};
const compareAny = (a: unknown, b: unknown) => {
  if (!a) {
    return Compare.GT;
  }
  if (!b) {
    return Compare.LT;
  }
  return Number(a) - Number(b);
};

const compareTag = (type: DataTypeOf<typeof t.tag>, a: unknown, b: unknown) => {
  if (a == null) {
    return Compare.GT;
  }
  if (b == null) {
    return Compare.LT;
  }
  const indexA = type.data?.findIndex(tag => tag.id === a);
  const indexB = type.data?.findIndex(tag => tag.id === b);
  return compareNumber(indexA, indexB);
};

const compare = (type: TypeInstance, a: unknown, b: unknown): CompareType => {
  if (typeSystem.unify(type, t.richText.instance())) {
    return compareString(a?.toString(), b?.toString());
  }
  if (typeSystem.unify(type, t.string.instance())) {
    return compareString(a, b);
  }
  if (typeSystem.unify(type, t.number.instance())) {
    return compareNumber(a, b);
  }
  if (typeSystem.unify(type, t.date.instance())) {
    return compareNumber(a, b);
  }
  if (typeSystem.unify(type, t.boolean.instance())) {
    return compareBoolean(a, b);
  }
  if (typeSystem.unify(type, t.tag.instance())) {
    return compareTag(type, a, b);
  }
  if (t.array.is(type)) {
    return compareArray(type, a, b);
  }
  return compareAny(a, b);
};

export const evalSort = (
  sort: Sort,
  view: SingleView
): ((rowA: Row, rowB: Row) => number) | undefined => {
  if (sort.sortBy.length) {
    const sortBy = sort.sortBy.map(sort => {
      return {
        ref: evalRef(view, sort.ref),
        desc: sort.desc,
      };
    });
    return (rowA, rowB) => {
      for (const sort of sortBy) {
        const refA = sort.ref?.(rowA);
        const refB = sort.ref?.(rowB);
        const result = compare(
          refA?.ttype ?? t.unknown.instance(),
          refA?.value,
          refB?.value
        );
        if (typeof result === 'number' && result !== 0) {
          return sort.desc ? -result : result;
        }
        if (result === Compare.GT) {
          return 1;
        }
        if (result === Compare.LT) {
          return -1;
        }
        continue;
      }
      return 0;
    };
  }
  return;
};
