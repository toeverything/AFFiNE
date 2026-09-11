import { describe, expect, it } from 'vitest';

import {
  colorForClient,
  readSketchCursors,
  SKETCH_AWARENESS_KEY,
} from './cursors';

describe('sketch in-widget cursors', () => {
  it('reads remote pointers for the same block only', () => {
    const states = new Map<
      number,
      {
        user?: { name?: string };
        [SKETCH_AWARENESS_KEY]?: {
          blockId?: string;
          pointer?: { x: number; y: number };
          color?: string;
        };
      }
    >([
      [
        1,
        {
          user: { name: 'Ada' },
          [SKETCH_AWARENESS_KEY]: {
            blockId: 'sk-1',
            pointer: { x: 12, y: 24 },
            color: '#f00',
          },
        },
      ],
      [
        2,
        {
          user: { name: 'Bob' },
          [SKETCH_AWARENESS_KEY]: { blockId: 'sk-2', pointer: { x: 1, y: 1 } },
        },
      ],
      [3, { user: { name: 'Me' }, [SKETCH_AWARENESS_KEY]: { blockId: 'sk-1' } }],
    ]);

    const { editors, cursors } = readSketchCursors(states, 'sk-1', 3);
    expect(editors).toEqual(['Ada']);
    expect(cursors).toEqual([
      {
        clientId: 1,
        name: 'Ada',
        color: '#f00',
        x: 12,
        y: 24,
        button: undefined,
      },
    ]);
    expect(colorForClient(2)).toMatch(/^#/);
  });
});
