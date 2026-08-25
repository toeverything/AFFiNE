import { describe, expect, it } from 'vitest';

import type { NativeIndexHit } from '../db';
import { createNode } from './node-builder';

function hit(fields: NativeIndexHit['fields']): NativeIndexHit {
  return { id: 'doc-id', score: 1, fields, highlights: [] };
}

describe('sqlite indexer native result mapping', () => {
  it.each([
    ['string', ['summary'], 'summary'],
    ['array', ['one', 'two'], ['one', 'two']],
    ['missing', [], ''],
  ])('maps %s stored values', (_, values, expected) => {
    const node = createNode(hit([{ field: 'title', values }]), {
      fields: ['title'],
    });
    expect(node.fields.title).toEqual(expected);
  });

  it('formats native highlight spans', () => {
    const native = hit([{ field: 'title', values: ['hello search'] }]);
    native.highlights = [
      {
        field: 'title',
        values: [{ valueIndex: 0, spans: [{ start: 6, end: 12 }] }],
      },
    ];
    const node = createNode(native, {
      highlights: [{ field: 'title', before: '<b>', end: '</b>' }],
    });
    expect(node.highlights.title).toEqual(['hello <b>search</b>']);
  });
});
