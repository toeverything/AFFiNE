import { Framework } from '@toeverything/infra';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, test } from 'vitest';

import type { DocsService } from '../../doc';
import { NumberPropertyFilterProvider } from '../impls/filters/number';
import { NumberPropertyGroupByProvider } from '../impls/group-by/number';
import { NumberPropertyOrderByProvider } from '../impls/order-by/number';

// a number property that was cleared in the doc info panel is stored as ''
const values = new Map<string, string | undefined>([
  ['zero', '0'],
  ['three', '3'],
  ['cleared', ''],
  ['never-set', undefined],
]);

function createFramework() {
  const docsService = {
    propertyValues$: () => of(values),
  } as unknown as DocsService;

  const framework = new Framework();
  framework.service(
    NumberPropertyFilterProvider,
    () => new NumberPropertyFilterProvider(docsService)
  );
  framework.service(
    NumberPropertyOrderByProvider,
    () => new NumberPropertyOrderByProvider(docsService)
  );
  framework.service(
    NumberPropertyGroupByProvider,
    () => new NumberPropertyGroupByProvider(docsService)
  );
  return framework.provider();
}

async function filter(method: string, value: string) {
  const provider = createFramework().get(NumberPropertyFilterProvider);
  const result = await firstValueFrom(
    provider.filter$({ type: 'property', key: 'n', method, value })
  );
  return [...result].sort();
}

describe('number property rules', () => {
  test('comparisons do not treat a cleared value as 0', async () => {
    expect(await filter('=', '0')).toEqual(['zero']);
    expect(await filter('<', '1')).toEqual(['zero']);
    expect(await filter('≤', '3')).toEqual(['three', 'zero']);
    expect(await filter('≥', '0')).toEqual(['three', 'zero']);
    expect(await filter('≠', '3')).toEqual(['zero']);
  });

  test('a cleared value is still reported as empty', async () => {
    expect(await filter('is-empty', '')).toEqual(['cleared', 'never-set']);
    expect(await filter('is-not-empty', '')).toEqual(['three', 'zero']);
  });

  test('order by skips cleared values', async () => {
    const provider = createFramework().get(NumberPropertyOrderByProvider);
    const result = await firstValueFrom(
      provider.orderBy$(of(new Set()), { type: 'property', key: 'n' })
    );
    expect(result).toEqual(['zero', 'three']);
  });

  test('group by does not put cleared values in the 0 group', async () => {
    const provider = createFramework().get(NumberPropertyGroupByProvider);
    const result = await firstValueFrom(
      provider.groupBy$(of(new Set()), { type: 'property', key: 'n' })
    );
    expect(
      Object.fromEntries([...result].map(([k, v]) => [k, [...v]]))
    ).toEqual({ '0': ['zero'], '3': ['three'] });
  });
});
