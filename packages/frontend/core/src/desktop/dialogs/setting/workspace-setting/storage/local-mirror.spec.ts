// @vitest-environment happy-dom

import { describe, expect, test } from 'vitest';

import { canRetryLocalMirror, canUseAffineVersion } from './local-mirror';

describe('local mirror conflict actions', () => {
  test('offers the confirmed AFFiNE version only for divergent local state', () => {
    expect(
      canUseAffineVersion({ type: 'conflict', paths: ['docs/A.md'] })
    ).toBe(true);
    expect(
      canUseAffineVersion({
        type: 'unsupported-local-change',
        paths: ['.metadata/workspace.json'],
        message: 'control file changed',
      })
    ).toBe(true);
    expect(canUseAffineVersion({ type: 'idle' })).toBe(false);
    expect(canUseAffineVersion({ type: 'permission-denied' })).toBe(false);
  });

  test('offers retry for pending and manually resolvable outcomes', () => {
    expect(
      canRetryLocalMirror({
        type: 'external-change-pending',
        message: 'waiting',
      })
    ).toBe(true);
    expect(
      canRetryLocalMirror({
        type: 'merge-conflict',
        path: 'docs/A-very-long-document-name.md',
        reason: 'same block changed',
      })
    ).toBe(true);
    expect(
      canRetryLocalMirror({ type: 'syncing', completed: 1, total: 2 })
    ).toBe(false);
  });
});
