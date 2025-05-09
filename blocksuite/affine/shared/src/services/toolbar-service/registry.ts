import { type Container, createIdentifier } from '@blocksuite/global/di';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import type { GfxModel } from '@blocksuite/std/gfx';
import { Extension, type ExtensionType } from '@blocksuite/store';
import { signal } from '@preact/signals-core';

import type { ToolbarPlacement } from './config';
import { Flags } from './flags';
import type { ToolbarModule } from './module';

export const ToolbarModuleIdentifier = createIdentifier<ToolbarModule>(
  'AffineToolbarModuleIdentifier'
);

export const ToolbarRegistryIdentifier =
  createIdentifier<ToolbarRegistryExtension>('AffineToolbarRegistryIdentifier');

export function ToolbarModuleExtension(module: ToolbarModule): ExtensionType {
  return {
    setup: di => {
      di.addImpl(ToolbarModuleIdentifier(module.id.variant), module);
    },
  };
}

export class ToolbarRegistryExtension extends Extension {
  flavour$ = signal<string>('affine:note');

  elementsMap$ = signal<Map<string, GfxModel[]>>(new Map());

  message$ = signal<{
    flavour: string;
    element: Element;
    setFloating: (element?: Element) => void;
  } | null>(null);

  placement$ = signal<ToolbarPlacement>('top');

  flags = new Flags();

  constructor(readonly std: BlockStdScope) {
    super();
  }

  get modules() {
    return this.std.provider.getAll(ToolbarModuleIdentifier);
  }

  getModuleBy(flavour: string) {
    return this.modules.get(flavour)?.config ?? null;
  }

  getModulePlacement(flavour: string, fallback: ToolbarPlacement = 'top') {
    return (
      this.getModuleBy(`custom:${flavour}`)?.placement ??
      this.getModuleBy(flavour)?.placement ??
      fallback
    );
  }

  static override setup(di: Container) {
    di.addImpl(ToolbarRegistryIdentifier, this, [StdIdentifier]);
  }
}
