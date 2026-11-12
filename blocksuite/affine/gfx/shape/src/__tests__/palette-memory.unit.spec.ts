import { describe, expect, it } from 'vitest';

import {
  getToolPaletteMemory,
  setToolPaletteMemory,
} from '../draggable/palette-memory.js';

describe('palette memory', () => {
  it('returns default memory when unset', () => {
    const memory = getToolPaletteMemory('palette-memory:unset');
    expect(memory).toEqual({ index: 0 });
  });

  it('stores independent memory per tool key', () => {
    setToolPaletteMemory('palette-memory:shape', {
      index: 2,
      activeKey: 'Blue',
    });
    setToolPaletteMemory('palette-memory:connector', {
      index: 1,
      activeKey: 'Green',
    });

    const shapeMemory = getToolPaletteMemory('palette-memory:shape');
    const connectorMemory = getToolPaletteMemory('palette-memory:connector');

    expect(shapeMemory).toEqual({ index: 2, activeKey: 'Blue' });
    expect(connectorMemory).toEqual({ index: 1, activeKey: 'Green' });
  });
});
