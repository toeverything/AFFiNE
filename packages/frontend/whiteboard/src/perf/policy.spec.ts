import { describe, expect, it } from 'vitest';

import { WHITEBOARD_LOD } from '../const';
import {
  getWidgetLodLevel,
  livePriorityScore,
  pickLiveIds,
  type RankedBudget,
  registerScopedPerfPolicy,
  tryLive,
  WhiteboardPerfPolicy,
  whiteboardPerfPolicy,
  xywhCenterDistance,
} from './policy';

describe('whiteboard perf policy', () => {
  it('uses the shared z0/z1 LOD thresholds', () => {
    expect(getWidgetLodLevel(WHITEBOARD_LOD.z0 - 0.01, false, false)).toBe(
      'l0'
    );
    expect(getWidgetLodLevel(WHITEBOARD_LOD.z1 - 0.01, false, false)).toBe(
      'l1'
    );
    expect(getWidgetLodLevel(WHITEBOARD_LOD.z1 + 0.01, false, true)).toBe('l2');
    expect(getWidgetLodLevel(0.1, true, false)).toBe('l2');
  });

  it('ranks selected above hover above viewport center', () => {
    const selected = livePriorityScore({
      selected: true,
      hovered: false,
      distanceToCenter: 400,
    });
    const hover = livePriorityScore({
      selected: false,
      hovered: true,
      distanceToCenter: 10,
    });
    const center = livePriorityScore({
      selected: false,
      hovered: false,
      distanceToCenter: 10,
    });
    const far = livePriorityScore({
      selected: false,
      hovered: false,
      distanceToCenter: 800,
    });
    expect(selected).toBeGreaterThan(hover);
    expect(hover).toBeGreaterThan(center);
    expect(center).toBeGreaterThan(far);
  });

  it('picks at most maxLive and keeps exempt ids', () => {
    const picked = pickLiveIds(
      [
        {
          id: 'far',
          kind: 'chart',
          selected: false,
          hovered: false,
          intersecting: true,
          distanceToCenter: 900,
        },
        {
          id: 'sel',
          kind: 'chart',
          selected: true,
          hovered: false,
          intersecting: true,
          distanceToCenter: 10,
        },
        {
          id: 'ex',
          kind: 'chart',
          selected: false,
          hovered: false,
          intersecting: true,
          distanceToCenter: 50,
          exempt: true,
        },
      ],
      1
    );
    expect(picked.has('sel')).toBe(true);
    expect(picked.has('ex')).toBe(true);
    expect(picked.has('far')).toBe(false);
  });

  it('releases a live slot when a higher-priority widget wants it', () => {
    whiteboardPerfPolicy.reset();
    // maxLiveSketches = 1, so selected B evicts idle A
    const live = new Set<string>();
    const budget: RankedBudget = {
      acquire(id) {
        live.add(id);
        return true;
      },
      release(id) {
        live.delete(id);
      },
    };
    expect(
      tryLive(budget, {
        id: 'a',
        kind: 'sketch',
        selected: false,
        hovered: false,
        intersecting: true,
        distanceToCenter: 10,
      })
    ).toBe(true);
    expect(
      tryLive(budget, {
        id: 'b',
        kind: 'sketch',
        selected: true,
        hovered: false,
        intersecting: true,
        distanceToCenter: 80,
      })
    ).toBe(true);
    expect(
      tryLive(budget, {
        id: 'a',
        kind: 'sketch',
        selected: false,
        hovered: false,
        intersecting: true,
        distanceToCenter: 10,
      })
    ).toBe(false);
    expect(live.has('a')).toBe(false);
    whiteboardPerfPolicy.reset();
  });

  it('gives each editor its own live slots and drops them on unregister', () => {
    whiteboardPerfPolicy.reset();
    const scoped = new WhiteboardPerfPolicy();
    const unregister = registerScopedPerfPolicy({
      policy: scoped,
      owns: id => id.startsWith('doc-a/'),
    });
    const candidate = (id: string) => ({
      id,
      kind: 'sketch' as const,
      selected: true,
      hovered: false,
      intersecting: true,
      distanceToCenter: 0,
    });

    whiteboardPerfPolicy.touch(candidate('doc-a/sketch'));
    whiteboardPerfPolicy.touch(candidate('orphan'));

    expect(scoped.list('sketch').map(item => item.id)).toEqual([
      'doc-a/sketch',
    ]);
    // maxLiveSketches = 1, yet both are live because they sit in different scopes
    expect(whiteboardPerfPolicy.isPicked('doc-a/sketch', 'sketch')).toBe(true);
    expect(whiteboardPerfPolicy.isPicked('orphan', 'sketch')).toBe(true);

    unregister();
    scoped.reset();
    expect(whiteboardPerfPolicy.list('sketch').map(item => item.id)).toEqual([
      'orphan',
    ]);
    whiteboardPerfPolicy.reset();
  });

  it('measures distance from xywh center to the viewport center', () => {
    expect(xywhCenterDistance('[0,0,100,40]', 50, 20)).toBe(0);
    expect(xywhCenterDistance('[0,0,100,40]', 50, 40)).toBe(20);
  });
});
