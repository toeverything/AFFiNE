import { describe, expect, test } from 'vitest';

import { CleanupService } from '..';

describe('lifecycle', () => {
  test('cleanup', () => {
    const cleanup = new CleanupService();
    let cleaned = false;
    cleanup.add(() => {
      cleaned = true;
    });
    cleanup.cleanup();
    expect(cleaned).toBe(true);
  });
});
