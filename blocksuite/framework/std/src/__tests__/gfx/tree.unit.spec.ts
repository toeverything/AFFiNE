import { describe, expect, test, vi } from 'vitest';

import {
  type GfxGroupCompatibleInterface,
  gfxGroupCompatibleSymbol,
} from '../../gfx/model/base.js';
import type { GfxModel } from '../../gfx/model/model.js';
import {
  batchAddChildren,
  batchRemoveChildren,
  canSafeAddToContainer,
  descendantElementsImpl,
  getTopElements,
} from '../../utils/tree.js';

type TestElement = {
  id: string;
  group: TestGroup | null;
  groups: TestGroup[];
};

type TestGroup = TestElement & {
  [gfxGroupCompatibleSymbol]: true;
  childIds: string[];
  childElements: GfxModel[];
  addChild: (element: GfxModel) => void;
  removeChild: (element: GfxModel) => void;
  hasChild: (element: GfxModel) => boolean;
  hasDescendant: (element: GfxModel) => boolean;
};

const createElement = (id: string): TestElement => ({
  id,
  group: null,
  groups: [],
});

const createGroup = (id: string): TestGroup => {
  const group: TestGroup = {
    id,
    [gfxGroupCompatibleSymbol]: true,
    group: null,
    groups: [],
    childIds: [],
    childElements: [],
    addChild(element: GfxModel) {
      const child = element as unknown as TestElement;
      if (this.childElements.includes(element)) {
        return;
      }
      this.childElements.push(element);
      this.childIds.push(child.id);
      child.group = this;
      child.groups = [...this.groups, this];
    },
    removeChild(element: GfxModel) {
      const child = element as unknown as TestElement;
      this.childElements = this.childElements.filter(item => item !== element);
      this.childIds = this.childIds.filter(id => id !== child.id);
      if (child.group === this) {
        child.group = null;
        child.groups = [];
      }
    },
    hasChild(element: GfxModel) {
      return this.childElements.includes(element);
    },
    hasDescendant(element: GfxModel) {
      return descendantElementsImpl(
        this as unknown as GfxGroupCompatibleInterface
      ).includes(element);
    },
  };

  return group;
};

describe('tree utils', () => {
  test('batchAddChildren prefers container.addChildren and deduplicates', () => {
    const a = createElement('a') as unknown as GfxModel;
    const b = createElement('b') as unknown as GfxModel;
    const container = {
      addChildren: vi.fn(),
      addChild: vi.fn(),
    };

    batchAddChildren(container as any, [a, a, b]);

    expect(container.addChildren).toHaveBeenCalledTimes(1);
    expect(container.addChildren).toHaveBeenCalledWith([a, b]);
    expect(container.addChild).not.toHaveBeenCalled();
  });

  test('batchRemoveChildren falls back to container.removeChild and deduplicates', () => {
    const a = createElement('a') as unknown as GfxModel;
    const b = createElement('b') as unknown as GfxModel;
    const container = {
      removeChild: vi.fn(),
    };

    batchRemoveChildren(container as any, [a, a, b]);

    expect(container.removeChild).toHaveBeenCalledTimes(2);
    expect(container.removeChild).toHaveBeenNthCalledWith(1, a);
    expect(container.removeChild).toHaveBeenNthCalledWith(2, b);
  });

  test('getTopElements removes descendants when ancestors are selected', () => {
    const root = createGroup('root');
    const nested = createGroup('nested');
    const leafA = createElement('leaf-a');
    const leafB = createElement('leaf-b');
    const leafC = createElement('leaf-c');

    root.addChild(leafA as unknown as GfxModel);
    root.addChild(nested as unknown as GfxModel);
    nested.addChild(leafB as unknown as GfxModel);

    const result = getTopElements([
      root as unknown as GfxModel,
      nested as unknown as GfxModel,
      leafA as unknown as GfxModel,
      leafB as unknown as GfxModel,
      leafC as unknown as GfxModel,
    ]);

    expect(result).toEqual([
      root as unknown as GfxModel,
      leafC as unknown as GfxModel,
    ]);
  });

  test('descendantElementsImpl stops on cyclic graph', () => {
    const groupA = createGroup('group-a');
    const groupB = createGroup('group-b');
    groupA.addChild(groupB as unknown as GfxModel);
    groupB.addChild(groupA as unknown as GfxModel);

    const descendants = descendantElementsImpl(groupA as unknown as any);

    expect(descendants).toHaveLength(2);
    expect(new Set(descendants).size).toBe(2);
  });

  test('canSafeAddToContainer blocks self and circular descendants', () => {
    const parent = createGroup('parent');
    const child = createGroup('child');
    const unrelated = createElement('plain');

    parent.addChild(child as unknown as GfxModel);

    expect(
      canSafeAddToContainer(parent as unknown as any, parent as unknown as any)
    ).toBe(false);
    expect(
      canSafeAddToContainer(child as unknown as any, parent as unknown as any)
    ).toBe(false);
    expect(
      canSafeAddToContainer(
        parent as unknown as any,
        unrelated as unknown as any
      )
    ).toBe(true);
  });
});
