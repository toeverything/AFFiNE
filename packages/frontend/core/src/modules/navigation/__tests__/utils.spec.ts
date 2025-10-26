/**
 * @vitest-environment happy-dom
 */
import { afterEach } from 'node:test';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { resolveLinkToDoc, toURLSearchParams } from '../utils';

vi.mock('@emoji-mart/react', () => ({
  Emoji: () => null,
}));

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
    '/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?blockIds=xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockIds: ['xxxx'],
    },
  ],
  [
    'http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?blockIds=xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockIds: ['xxxx'],
    },
  ],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/all', null],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/collection', null],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/tag', null],
  ['http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/trash', null],
  [
    'file//./workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?blockIds=xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      blockIds: ['xxxx'],
    },
  ],
  [
    'http//localhost:8000/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?mode=page&blockIds=xxxx',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      mode: 'page',
      blockIds: ['xxxx'],
    },
  ],
  [
    'http//localhost:8000/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?mode=&blockIds=',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
    },
  ],
  [
    'http//localhost:8000/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?mode=edgeless&elementIds=yyyy',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      mode: 'edgeless',
      elementIds: ['yyyy'],
    },
  ],
  [
    'http//localhost:8000/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?mode=edgeles&elementId=yyyy',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
    },
  ],
  [
    'http//localhost:8000/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?mode=edgeless&elementIds=,yyyy,',
    {
      workspaceId: '48__RTCSwASvWZxyAk3Jw',
      docId: '-Uge-K6SYcAbcNYfQ5U-j',
      mode: 'edgeless',
      elementIds: ['yyyy'],
    },
  ],
];

for (const [input, expected] of testCases) {
  defineTest(input, expected);
}

// self-hosted
describe('resolveLinkToDoc in self-hosted', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('location', { origin: 'https://local.first' });
  });

  const testCases: [string, ReturnType<typeof resolveLinkToDoc>][] = [
    ['http://example.com/', null],
    [
      '/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?blockIds=xxxx',
      {
        workspaceId: '48__RTCSwASvWZxyAk3Jw',
        docId: '-Uge-K6SYcAbcNYfQ5U-j',
        blockIds: ['xxxx'],
      },
    ],
    [
      'http://affine.pro/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?blockIds=xxxx',
      {
        workspaceId: '48__RTCSwASvWZxyAk3Jw',
        docId: '-Uge-K6SYcAbcNYfQ5U-j',
        blockIds: ['xxxx'],
      },
    ],
    [
      'https://local.first/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j?blockIds=xxxx',
      {
        workspaceId: '48__RTCSwASvWZxyAk3Jw',
        docId: '-Uge-K6SYcAbcNYfQ5U-j',
        blockIds: ['xxxx'],
      },
    ],
  ];

  for (const [input, expected] of testCases) {
    test(`resolveLinkToDoc(${input})InSelfHosted`, () => {
      const result = resolveLinkToDoc(input);
      expect(result).toEqual(expected);
    });
  }
});

function defineTestWithToURLSearchParams(
  input?: Partial<Record<string, string | string[]>>,
  expected?: ReturnType<typeof toURLSearchParams>
) {
  test(`toURLSearchParams(${JSON.stringify(input)})`, () => {
    const result = toURLSearchParams(input);
    expect(result).toEqual(expected);
  });
}

const testCases2: [
  Partial<Record<string, string | string[]> | undefined>,
  ReturnType<typeof toURLSearchParams>,
][] = [
  [undefined, undefined],
  [
    { blockIds: ['x'] },
    new URLSearchParams({
      blockIds: 'x',
    }),
  ],
  [{ blockIds: [] }, new URLSearchParams()],
  [
    { blockIds: ['', 'x', ''] },
    new URLSearchParams({
      blockIds: 'x',
    }),
  ],
  [{ mode: undefined }, new URLSearchParams()],
  [{ mode: '' }, new URLSearchParams()],
  [
    { mode: 'page', blockIds: ['x', 'y', 'z'], elementIds: ['a', 'b', 'c'] },
    new URLSearchParams({
      mode: 'page',
      blockIds: 'x,y,z',
      elementIds: 'a,b,c',
    }),
  ],
  [
    { mode: undefined, blockIds: undefined, elementIds: undefined },
    new URLSearchParams(),
  ],
];

for (const [input, expected] of testCases2) {
  defineTestWithToURLSearchParams(input, expected);
}
