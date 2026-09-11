import { describe, expect, it } from 'vitest';

import {
  anchorFromSelection,
  parseCommentAnchor,
  parseCommentIds,
  pinPosition,
  pinsForBlock,
  primaryCommentId,
} from './comment-anchor';

describe('whiteboard comment anchors', () => {
  it('parses gfx and card anchors and pin positions', () => {
    expect(
      parseCommentAnchor({
        blockId: 'chart-1',
        point: [12, 8],
      })
    ).toEqual({ blockId: 'chart-1', point: [12, 8], rowId: undefined });
    expect(parseCommentAnchor({ blockId: '' })).toBeUndefined();
    expect(
      anchorFromSelection({
        elementIds: ['wb-1'],
        rowId: 'row-9',
        point: [1, 2],
      })
    ).toEqual({ blockId: 'wb-1', point: [1, 2], rowId: 'row-9' });

    expect(pinPosition({ x: 10, y: 20, w: 100, h: 40 })).toEqual({
      x: 110,
      y: 20,
    });
    expect(pinPosition({ x: 10, y: 20, w: 100, h: 40 }, [5, 7])).toEqual({
      x: 15,
      y: 27,
    });
  });

  it('reads commentId list from a row/block comments map', () => {
    const comments = { a: true, b: false, c: true };
    expect(parseCommentIds(comments)).toEqual(['a', 'c']);
    expect(primaryCommentId(comments)).toBe('a');
    expect(
      pinsForBlock('row-1', { x: 0, y: 0, w: 20, h: 10 }, comments, undefined, 'row-1')
    ).toEqual([
      { commentId: 'a', blockId: 'row-1', x: 20, y: 0, rowId: 'row-1' },
      { commentId: 'c', blockId: 'row-1', x: 20, y: 0, rowId: 'row-1' },
    ]);
  });
});
