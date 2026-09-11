import { Text } from '@blocksuite/affine/store';
import { describe, expect, it } from 'vitest';

import { WHITEBOARD_FLAVOURS } from '../const';
import {
  applyStressPlan,
  buildStressPlan,
  createStoreStressApplier,
  type StressBlockNode,
  type StressStore,
  WHITEBOARD_STRESS_FIXTURE,
} from './stress';

type AddedBlock = {
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  parent: string | null;
};

function createStoreDouble() {
  const added: AddedBlock[] = [];
  const surface: StressBlockNode = {
    id: 'surface-1',
    flavour: 'affine:surface',
    children: [],
  };
  const root: StressBlockNode = {
    id: 'page-1',
    flavour: 'affine:page',
    children: [surface],
  };
  const store: StressStore = {
    root,
    addBlock(flavour, props, parent) {
      const id = `block-${added.length}`;
      added.push({
        id,
        flavour,
        props,
        parent: typeof parent === 'string' ? parent : (parent?.id ?? null),
      });
      return id;
    },
  };
  return { store, added };
}

describe('whiteboard stress fixture', () => {
  it('builds the §6.5 mix: 1k notes, 50 chart snapshots, 5 live charts, 1 sketch', () => {
    const plan = buildStressPlan();
    expect(plan.notes).toHaveLength(WHITEBOARD_STRESS_FIXTURE.notes);
    expect(plan.sketches).toHaveLength(WHITEBOARD_STRESS_FIXTURE.sketches);
    expect(plan.charts.filter(chart => chart.live)).toHaveLength(
      WHITEBOARD_STRESS_FIXTURE.liveCharts
    );
    expect(plan.charts.filter(chart => !chart.live)).toHaveLength(
      WHITEBOARD_STRESS_FIXTURE.chartSnapshots
    );
  });

  it('applies the plan through the host API', () => {
    const calls = { notes: 0, charts: 0, sketches: 0 };
    applyStressPlan(
      buildStressPlan({
        notes: 3,
        chartSnapshots: 2,
        liveCharts: 1,
        sketches: 1,
      }),
      {
        addNote: () => {
          calls.notes += 1;
        },
        addChart: () => {
          calls.charts += 1;
        },
        addSketch: () => {
          calls.sketches += 1;
        },
      }
    );
    expect(calls).toEqual({ notes: 3, charts: 3, sketches: 1 });
  });

  it('writes notes, paragraphs and widgets into a store', () => {
    const { store, added } = createStoreDouble();
    applyStressPlan(
      buildStressPlan({
        notes: 2,
        chartSnapshots: 2,
        liveCharts: 1,
        sketches: 1,
      }),
      createStoreStressApplier(store)
    );

    const ofFlavour = (flavour: string) =>
      added.filter(block => block.flavour === flavour);

    expect(ofFlavour('affine:note')).toHaveLength(2);
    expect(ofFlavour('affine:paragraph')).toHaveLength(2);
    expect(ofFlavour(WHITEBOARD_FLAVOURS.chart)).toHaveLength(3);
    expect(ofFlavour(WHITEBOARD_FLAVOURS.sketch)).toHaveLength(1);

    expect(ofFlavour('affine:note').map(block => block.parent)).toEqual([
      'page-1',
      'page-1',
    ]);
    expect(
      ofFlavour(WHITEBOARD_FLAVOURS.chart).map(block => block.parent)
    ).toEqual(['surface-1', 'surface-1', 'surface-1']);
    expect(ofFlavour(WHITEBOARD_FLAVOURS.sketch)[0]?.parent).toBe('surface-1');

    const paragraph = ofFlavour('affine:paragraph')[0];
    expect(paragraph?.parent).toBe(ofFlavour('affine:note')[0]?.id);
    expect(paragraph?.props.text).toBeInstanceOf(Text);

    expect(
      ofFlavour(WHITEBOARD_FLAVOURS.chart).filter(
        block => block.props.liveBudgetExempt
      )
    ).toHaveLength(1);
  });

  it('refuses to apply without an edgeless surface', () => {
    expect(() =>
      createStoreStressApplier({ root: null, addBlock: () => 'x' })
    ).toThrow(/root block/);
    expect(() =>
      createStoreStressApplier({
        root: { id: 'page-1', flavour: 'affine:page', children: [] },
        addBlock: () => 'x',
      })
    ).toThrow(/surface/);
  });
});
