import { describe, expect, test } from 'vitest';

import { createConnectorPathWithJumps } from '../renderer/utils.js';

describe('rounded connector path', () => {
  test('rounded paths emit curve commands at corners', () => {
    const path = createConnectorPathWithJumps(
      [
        { type: 0, x: 0, y: 0 },
        { type: 0, x: 80, y: 0 },
        { type: 0, x: 80, y: 60 },
      ],
      'none',
      10,
      2,
      true,
      12
    );

    expect(path).toContain('C');
  });
});
