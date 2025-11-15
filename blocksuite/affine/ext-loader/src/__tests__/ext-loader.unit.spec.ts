import { Container } from '@blocksuite/global/di';
import { type ExtensionType } from '@blocksuite/store';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ExtensionManager } from '../manager';
import {
  StoreExtensionManager,
  StoreExtensionManagerIdentifier,
} from '../store-manager';
import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '../store-provider';
import { ViewExtensionManager } from '../view-manager';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '../view-provider';

export const Ext1: ExtensionType = {
  setup: () => {},
};
export const Ext2: ExtensionType = {
  setup: () => {},
};
export const Ext3: ExtensionType = {
  setup: () => {},
};
export const Ext4: ExtensionType = {
  setup: () => {},
};
export const Ext5: ExtensionType = {
  setup: () => {},
};

it('should be able to load extensions', () => {
  class StoreExt1 extends StoreExtensionProvider {
    override name = 'StoreExt1';

    override setup(context: StoreExtensionContext) {
      super.setup(context);
      context.register(Ext1);
    }
  }
  const manager = new ExtensionManager([StoreExt1]);
  const storeExtensions = manager.get('store');
  expect(storeExtensions).toEqual([Ext1]);
});

describe('multiple scopes', () => {
  const setup1 = vi.fn();
  const setup2 = vi.fn();
  class ViewExt1 extends ViewExtensionProvider {
    override name = 'ViewExt1';

    constructor() {
      super();
      setup1();
    }

    override setup(context: ViewExtensionContext, option?: { foo: number }) {
      super.setup(context, option);
      if (context.scope === 'page') {
        context.register(Ext2);
      }
      if (context.scope === 'edgeless') {
        context.register(Ext3);
      }
    }
  }
  class ViewExt2 extends ViewExtensionProvider {
    override name = 'ViewExt2';

    constructor() {
      super();
      setup2();
    }

    override setup(context: ViewExtensionContext) {
      super.setup(context);
      if (context.scope === 'page') {
        context.register(Ext4);
      }
      if (context.scope === 'edgeless') {
        context.register(Ext5);
      }
    }
  }
  const manager = new ExtensionManager([ViewExt1, ViewExt2]);
  const pageExtensions = manager.get('page');
  const edgelessExtensions = manager.get('edgeless');
  it('should be able to load extensions from different scopes', () => {
    expect(pageExtensions).toEqual([Ext2, Ext4]);
    expect(edgelessExtensions).toEqual([Ext3, Ext5]);
  });

  it('should cache provider instances', () => {
    manager.get('page');
    manager.get('edgeless');
    expect(setup1).toHaveBeenCalledTimes(1);
    expect(setup2).toHaveBeenCalledTimes(1);
    manager.get('page');
    manager.get('edgeless');
    expect(setup1).toHaveBeenCalledTimes(1);
    expect(setup2).toHaveBeenCalledTimes(1);
  });
});

it('should be able to validate schema', () => {
  type Option = { foo: number; bar: string };
  const setupOption = vi.fn();
  class ViewExt1 extends ViewExtensionProvider<Option> {
    override name = 'ViewExt1';

    override schema = z.object({
      foo: z.number(),
      bar: z.string(),
    });

    override setup(context: ViewExtensionContext, option?: Option) {
      super.setup(context, option);
      if (context.scope === 'page') {
        setupOption(option);
        context.register(Ext1);
      }
      if (context.scope === 'edgeless') {
        setupOption(option);
        context.register(Ext2);
      }
    }
  }
  const manager = new ExtensionManager([ViewExt1]);

  manager.configure(ViewExt1, { foo: 1, bar: '2' });
  manager.configure(ViewExt1, prev => {
    if (!prev) {
      return prev;
    }
    return {
      ...prev,
      foo: prev.foo + 1,
    };
  });
  let viewExtensions = manager.get('page');
  expect(viewExtensions).toEqual([Ext1]);
  expect(setupOption).toHaveBeenCalledWith({ foo: 2, bar: '2' });

  setupOption.mockClear();
  manager.configure(ViewExt1, undefined);
  viewExtensions = manager.get('edgeless');
  expect(viewExtensions).toEqual([Ext2]);
  expect(setupOption).toHaveBeenCalledWith(undefined);

  viewExtensions = manager.get('page');
  expect(setupOption).toHaveBeenCalledWith(undefined);
});

it('should extension manager be able to be injected', () => {
  class StoreExt1 extends StoreExtensionProvider {
    override name = 'StoreExt1';

    override setup(context: StoreExtensionContext) {
      super.setup(context);
      context.register(Ext1);
    }
  }
  const manager = new StoreExtensionManager([StoreExt1]);
  const extensions = manager.get('store');
  const container = new Container();
  extensions.forEach(ext => {
    ext.setup(container);
  });
  const provider = container.provider();
  expect(provider.get(StoreExtensionManagerIdentifier)).toBe(manager);
});

it('should effect only run once', () => {
  const effect1 = vi.fn();
  const effect2 = vi.fn();
  class ViewExt1 extends ViewExtensionProvider {
    override name = 'ViewExt1';

    override effect() {
      super.effect();
      effect1();
    }

    override setup(context: ViewExtensionContext) {
      super.setup(context);
      context.register(Ext1);
    }
  }

  class ViewExt2 extends ViewExtensionProvider {
    override name = 'ViewExt2';

    override effect() {
      super.effect();
      effect2();
    }

    override setup(context: ViewExtensionContext) {
      super.setup(context);
      context.register(Ext2);
    }
  }

  const manager = new ViewExtensionManager([ViewExt1]);

  expect(ViewExt1.effectRan).toBe(false);
  expect(ViewExt2.effectRan).toBe(false);

  manager.get('page');

  expect(ViewExt1.effectRan).toBe(true);
  expect(ViewExt2.effectRan).toBe(false);

  expect(effect1).toHaveBeenCalledTimes(1);
  expect(effect2).toHaveBeenCalledTimes(0);

  manager.get('edgeless');

  expect(ViewExt1.effectRan).toBe(true);
  expect(ViewExt2.effectRan).toBe(false);

  expect(effect1).toHaveBeenCalledTimes(1);
  expect(effect2).toHaveBeenCalledTimes(0);
});
