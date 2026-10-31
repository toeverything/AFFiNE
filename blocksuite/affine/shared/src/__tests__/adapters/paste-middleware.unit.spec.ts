import { describe, expect, test } from 'vitest';

import {
  canCreatePasteTransformer,
  pasteMiddleware,
} from '../../adapters/middlewares/paste.js';

describe('paste middleware', () => {
  test('skips paste transformer when slice has no first snapshot', () => {
    expect(canCreatePasteTransformer({ content: [] } as never)).toBe(false);
  });

  test('resets previous paste transformer before empty slice early return', () => {
    expect(pasteMiddleware.toString()).toMatch(
      /if \(payload\.type === ["']slice["']\) \{\s*tr = (?:undefined|void 0);/m
    );
  });
});
