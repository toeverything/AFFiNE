import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('fractional-indexing', () => ({
  generateKeyBetween: vi.fn(),
  generateNKeysBetween: vi.fn(),
}));

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

import { ungroupCommand } from '../command/group-api.js';

type TestElement = {
  id: string;
  index: string;
  group: TestElement | null;
  childElements: TestElement[];
  removeChildren?: (elements: TestElement[]) => void;
  addChildren?: (elements: TestElement[]) => void;
};

const mockedGenerateNKeysBetween = vi.mocked(generateNKeysBetween);
const mockedGenerateKeyBetween = vi.mocked(generateKeyBetween);

const createElement = (
  id: string,
  index: string,
  group: TestElement | null
): TestElement => ({
  id,
  index,
  group,
  childElements: [],
});

const createUngroupFixture = () => {
  const parent = createElement('parent', 'p0', null);
  const left = createElement('left', 'a0', parent);
  const right = createElement('right', 'a0', parent);
  const group = createElement('group', 'm0', parent);
  const childA = createElement('child-a', 'c0', group);
  const childB = createElement('child-b', 'c1', group);

  group.childElements = [childB, childA];
  parent.childElements = [left, group, right];

  parent.removeChildren = vi.fn();
  parent.addChildren = vi.fn();
  group.removeChildren = vi.fn();

  const elementOrder = new Map<TestElement, number>([
    [left, 0],
    [group, 1],
    [right, 2],
    [childA, 3],
    [childB, 4],
  ]);

  const selectionSet = vi.fn();
  const gfx = {
    layer: {
      compare: (a: TestElement, b: TestElement) =>
        (elementOrder.get(a) ?? 0) - (elementOrder.get(b) ?? 0),
    },
    selection: {
      set: selectionSet,
    },
  };

  const std = {
    get: vi.fn(() => gfx),
    store: {
      transact: (callback: () => void) => callback(),
    },
  };

  return {
    childA,
    childB,
    group,
    parent,
    selectionSet,
    std,
  };
};

describe('ungroupCommand', () => {
  beforeEach(() => {
    mockedGenerateNKeysBetween.mockReset();
    mockedGenerateKeyBetween.mockReset();
  });

  test('falls back to open-ended key generation when sibling interval is invalid', () => {
    const fixture = createUngroupFixture();
    mockedGenerateNKeysBetween
      .mockImplementationOnce(() => {
        throw new Error('interval reversed');
      })
      .mockReturnValueOnce(['n0', 'n1']);

    const next = vi.fn();
    ungroupCommand(
      {
        std: fixture.std,
        group: fixture.group as any,
      } as any,
      next
    );

    expect(mockedGenerateNKeysBetween).toHaveBeenNthCalledWith(
      1,
      'a0',
      'a0',
      2
    );
    expect(mockedGenerateNKeysBetween).toHaveBeenNthCalledWith(
      2,
      'a0',
      null,
      2
    );
    expect(fixture.childA.index).toBe('n0');
    expect(fixture.childB.index).toBe('n1');
    expect(fixture.selectionSet).toHaveBeenCalledWith({
      editing: false,
      elements: ['child-a', 'child-b'],
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('falls back to key-by-key generation when all batched strategies fail', () => {
    const fixture = createUngroupFixture();
    mockedGenerateNKeysBetween.mockImplementation(() => {
      throw new Error('invalid range');
    });

    let seq = 0;
    mockedGenerateKeyBetween.mockImplementation(() => `k${seq++}`);

    ungroupCommand(
      {
        std: fixture.std,
        group: fixture.group as any,
      } as any,
      vi.fn()
    );

    expect(mockedGenerateNKeysBetween).toHaveBeenCalledTimes(4);
    expect(mockedGenerateKeyBetween).toHaveBeenCalledTimes(2);
    expect(fixture.childA.index).toBe('k0');
    expect(fixture.childB.index).toBe('k1');
  });
});
