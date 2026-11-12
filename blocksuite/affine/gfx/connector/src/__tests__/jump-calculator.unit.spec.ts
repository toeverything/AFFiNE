import { ConnectorMode } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import { updateConnectorJumps } from '../jump-calculator';

function connector(id: string, index: string, path: Array<[number, number]>) {
  return {
    id,
    index,
    mode: ConnectorMode.Orthogonal,
    jumpStyle: 'gap',
    absolutePath: path,
  } as any;
}

describe('updateConnectorJumps', () => {
  it('does not draw a jump where two connectors run coincident then diverge at a shared corner', () => {
    // A runs straight through (0,0) -> (0,2) with no turn.
    // B runs (0,0) -> (0,1) -> (1,1): coincident with A for the first half,
    // then turns away at (0,1). That divergence point is a real line/line
    // intersection mathematically (A's segment passes through it, and it's
    // exactly B's own corner vertex) but must not render as a jump — it's
    // where the two connectors are actually meant to touch/diverge, not a
    // visual pass-through crossing.
    const a = connector('a', '0', [
      [0, 0],
      [0, 2],
    ]);
    const b = connector('b', '1', [
      [0, 0],
      [0, 1],
      [1, 1],
    ]);

    const routed = updateConnectorJumps(a, [a, b]);
    const jumps = routed.filter(p => p.type === 1);

    expect(jumps).toHaveLength(0);
  });

  it('still draws a jump for a genuine interior crossing', () => {
    // A real X-crossing, far from either connector's own endpoints.
    const a = connector('a', '0', [
      [0, 0],
      [2, 2],
    ]);
    const b = connector('b', '1', [
      [0, 2],
      [2, 0],
    ]);

    const routed = updateConnectorJumps(a, [a, b]);
    const jumps = routed.filter(p => p.type === 1);

    expect(jumps).toHaveLength(1);
    expect(jumps[0].x).toBeCloseTo(1);
    expect(jumps[0].y).toBeCloseTo(1);
  });
});
