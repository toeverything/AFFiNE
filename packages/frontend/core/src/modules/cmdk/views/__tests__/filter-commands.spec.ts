/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';

import { filterSortAndGroupCommands } from '../filter-commands';
import type { CMDKCommand } from '../types';

const commands: CMDKCommand[] = (
  [
    {
      id: 'affine:goto-all-pages',
      category: 'affine:navigation',
      label: { title: 'Go to All Pages' },
    },
    {
      id: 'affine:goto-page-list',
      category: 'affine:navigation',
      label: { title: 'Go to Page List' },
    },
    {
      id: 'affine:new-page',
      category: 'affine:creation',
      alwaysShow: true,
      label: { title: 'New Page' },
    },
    {
      id: 'affine:new-edgeless-page',
      category: 'affine:creation',
      alwaysShow: true,
      label: { title: 'New Edgeless' },
    },
    {
      id: 'affine:pages.foo',
      category: 'affine:pages',
      label: { title: 'New Page', subTitle: 'foo' },
    },
    {
      id: 'affine:pages.bar',
      category: 'affine:pages',
      label: { title: 'New Page', subTitle: 'bar' },
    },
  ] as const
).map(c => {
  return {
    ...c,
    run: () => {},
  };
});

describe('filterSortAndGroupCommands', () => {
  function defineTest(
    name: string,
    query: string,
    expected: [string, string[]][]
  ) {
    test(name, () => {
      // Call the function
      const result = filterSortAndGroupCommands(commands, query);
      const sortedIds = result.map(([category, commands]) => {
        return [category, commands.map(command => command.id)];
      });

      console.log(JSON.stringify(sortedIds));

      // Assert the result
      expect(sortedIds).toEqual(expected);
    });
  }

  defineTest('without query', '', [
    ['affine:navigation', ['affine:goto-all-pages', 'affine:goto-page-list']],
    ['affine:creation', ['affine:new-page', 'affine:new-edgeless-page']],
    ['affine:pages', ['affine:pages.foo', 'affine:pages.bar']],
  ]);

  defineTest('with query = a', 'a', [
    [
      'affine:results',
      [
        'affine:goto-all-pages',
        'affine:pages.foo',
        'affine:pages.bar',
        'affine:new-page',
        'affine:new-edgeless-page',
        'affine:goto-page-list',
      ],
    ],
  ]);

  defineTest('with query = nepa', 'nepa', [
    [
      'affine:results',
      [
        'affine:pages.foo',
        'affine:pages.bar',
        'affine:new-page',
        'affine:new-edgeless-page',
      ],
    ],
  ]);

  defineTest('with query = new', 'new', [
    [
      'affine:results',
      [
        'affine:pages.foo',
        'affine:pages.bar',
        'affine:new-page',
        'affine:new-edgeless-page',
      ],
    ],
  ]);

  defineTest('with query = foo', 'foo', [
    [
      'affine:results',
      ['affine:pages.foo', 'affine:new-page', 'affine:new-edgeless-page'],
    ],
  ]);
});
