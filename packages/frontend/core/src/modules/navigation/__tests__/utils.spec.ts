import { afterEach } from 'node:test';

import { beforeEach, expect, test, vi } from 'vitest';

import { resolveLinkToDoc } from '../utils';

function defineTest(
  input: string,
  expected: ReturnType<typeof resolveLinkToDoc>
) {
  test(`resolveLinkToDoc(${input})`, () => {
    const result = resolveLinkToDoc(input);
    expect(result).toEqual(expected);
  });
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://affine.pro' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const testCases: [string, ReturnType<typeof resolveLinkToDoc>][] = [
  ['http://example.com/', null],
  [
    '/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j#xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockId: 'xxxx',
    },
  ],
  [
    'http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j#xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockId: 'xxxx',
    },
  ],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/all', null],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/collection', null],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/tag', null],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/trash', null],
  [
    'file//./workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j#xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockId: 'xxxx',
    },
  ],
  [
    'http//localhost:8000/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j#xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockId: 'xxxx',
    },
  ],
];

for (const [input, expected] of testCases) {
  defineTest(input, expected);
}
