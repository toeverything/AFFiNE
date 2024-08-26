import { expect, test } from 'vitest';

import { unflattenObject } from '../unflatten-object';

test('unflattenObject', () => {
  const ob = {
    'a.b.c': 1,
    d: 2,
  };
  const result = unflattenObject(ob);
  expect(result).toEqual({
    a: {
      b: {
        c: 1,
      },
    },
    d: 2,
  });
});
