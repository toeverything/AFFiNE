import { ConnectorMode } from '@blocksuite/affine-model';
import { describe, expect, test } from 'vitest';

import { buildJumpOrder, updateConnectorJumps } from '../jump-calculator.js';

type MockConnector = {
  id: string;
  index: string;
  absolutePath: Array<[number, number]>;
  jumpStyle: 'none' | 'arc' | 'gap';
  mode: ConnectorMode;
};

const createConnector = (props: Partial<MockConnector>): MockConnector => ({
  id: 'connector',
  index: 'a0',
  absolutePath: [
    [0, 0],
    [100, 0],
  ],
  jumpStyle: 'arc',
  mode: ConnectorMode.Orthogonal,
  ...props,
});

describe('connector jumps', () => {
  test('creates jump markers at intersections', () => {
    const horizontal = createConnector({
      id: 'h',
      index: 'a0',
      absolutePath: [
        [0, 50],
        [100, 50],
      ],
    });
    const vertical = createConnector({
      id: 'v',
      index: 'a1',
      absolutePath: [
        [50, 0],
        [50, 100],
      ],
    });

    const routed = updateConnectorJumps(
      horizontal as any,
      [horizontal, vertical] as any
    );
    const jumpCount = routed.filter(point => point.type === 1).length;
    expect(jumpCount).toBeGreaterThan(0);
  });

  test('returns empty for curve mode or jump style none', () => {
    const base = createConnector({
      id: 'base',
      absolutePath: [
        [0, 40],
        [100, 40],
      ],
    });
    const other = createConnector({
      id: 'other',
      index: 'b0',
      absolutePath: [
        [50, 0],
        [50, 100],
      ],
    });

    const curve = updateConnectorJumps(
      createConnector({ id: 'curve', mode: ConnectorMode.Curve }) as any,
      [base, other] as any
    );
    expect(curve).toEqual([]);

    const noneStyle = updateConnectorJumps(
      createConnector({ id: 'none', jumpStyle: 'none' }) as any,
      [base, other] as any
    );
    expect(noneStyle).toEqual([]);
  });

  test('jump order limits markers to earlier connectors', () => {
    const first = createConnector({
      id: 'first',
      index: 'a0',
      absolutePath: [
        [0, 30],
        [100, 30],
      ],
    });
    const second = createConnector({
      id: 'second',
      index: 'a1',
      absolutePath: [
        [50, 0],
        [50, 80],
      ],
    });

    const { orderMap } = buildJumpOrder([first as any, second as any]);
    const firstRouted = updateConnectorJumps(
      first as any,
      [first, second] as any,
      orderMap
    );
    const secondRouted = updateConnectorJumps(
      second as any,
      [first, second] as any,
      orderMap
    );

    expect(firstRouted.filter(point => point.type === 1)).toHaveLength(0);
    expect(
      secondRouted.filter(point => point.type === 1).length
    ).toBeGreaterThan(0);
  });

  test('straight connector does not jump over curve connector', () => {
    const curve = createConnector({
      id: 'curve',
      index: 'a0',
      mode: ConnectorMode.Curve,
      absolutePath: [
        [0, 50],
        [100, 50],
      ],
    });
    const straight = createConnector({
      id: 'straight',
      index: 'a1',
      mode: ConnectorMode.Orthogonal,
      absolutePath: [
        [50, 0],
        [50, 100],
      ],
      jumpStyle: 'arc',
    });

    const routed = updateConnectorJumps(
      straight as any,
      [curve, straight] as any
    );
    expect(routed.filter(point => point.type === 1)).toHaveLength(0);
  });

  test('curve connector never renders jump markers', () => {
    const straight = createConnector({
      id: 'straight',
      index: 'a0',
      mode: ConnectorMode.Orthogonal,
      absolutePath: [
        [0, 60],
        [120, 60],
      ],
      jumpStyle: 'arc',
    });
    const curve = createConnector({
      id: 'curve',
      index: 'a1',
      mode: ConnectorMode.Curve,
      absolutePath: [
        [60, 0],
        [60, 120],
      ],
      jumpStyle: 'arc',
    });

    const routed = updateConnectorJumps(curve as any, [straight, curve] as any);
    expect(routed.filter(point => point.type === 1)).toHaveLength(0);
  });
});
