import { expect, test } from 'vitest';

import {
  deltaInsertsToChunks,
  transformDelta,
} from '../../inline/utils/delta-convert.js';

test('transformDelta', () => {
  expect(
    transformDelta({
      insert: 'aaa',
      attributes: {
        bold: true,
      },
    })
  ).toEqual([
    {
      insert: 'aaa',
      attributes: {
        bold: true,
      },
    },
  ]);

  expect(
    transformDelta({
      insert: '\n\naaa\n\nbbb\n\n',
      attributes: {
        bold: true,
      },
    })
  ).toEqual([
    '\n',
    '\n',
    {
      insert: 'aaa',
      attributes: {
        bold: true,
      },
    },
    '\n',
    '\n',
    {
      insert: 'bbb',
      attributes: {
        bold: true,
      },
    },
    '\n',
    '\n',
  ]);
});

test('deltaInsertsToChunks', () => {
  expect(
    deltaInsertsToChunks([
      {
        insert: 'aaa',
        attributes: {
          bold: true,
        },
      },
    ])
  ).toEqual([
    [
      {
        insert: 'aaa',
        attributes: {
          bold: true,
        },
      },
    ],
  ]);

  expect(
    deltaInsertsToChunks([
      {
        insert: '\n\naaa\nbbb\n\n',
        attributes: {
          bold: true,
        },
      },
    ])
  ).toEqual([
    [],
    [],
    [
      {
        insert: 'aaa',
        attributes: {
          bold: true,
        },
      },
    ],
    [
      {
        insert: 'bbb',
        attributes: {
          bold: true,
        },
      },
    ],
    [],
    [],
  ]);

  expect(
    deltaInsertsToChunks([
      {
        insert: '\n\naaa\n',
        attributes: {
          bold: true,
        },
      },
      {
        insert: '\nbbb\n\n',
        attributes: {
          italic: true,
        },
      },
    ])
  ).toEqual([
    [],
    [],
    [
      {
        insert: 'aaa',
        attributes: {
          bold: true,
        },
      },
    ],
    [],
    [
      {
        insert: 'bbb',
        attributes: {
          italic: true,
        },
      },
    ],
    [],
    [],
  ]);
});
