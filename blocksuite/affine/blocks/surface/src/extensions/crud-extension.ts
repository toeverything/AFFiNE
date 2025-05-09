import type { SurfaceElementModelMap } from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import {
  GfxBlockElementModel,
  GfxControllerIdentifier,
  type GfxModel,
  isGfxGroupCompatibleModel,
} from '@blocksuite/std/gfx';
import { type BlockModel, Extension } from '@blocksuite/store';

import type { SurfaceBlockModel } from '../surface-model';
import { getLastPropsKey } from '../utils/get-last-props-key';
import { isConnectable, isNoteBlock } from './query';

export const EdgelessCRUDIdentifier = createIdentifier<EdgelessCRUDExtension>(
  'AffineEdgelessCrudService'
);

export class EdgelessCRUDExtension extends Extension {
  constructor(readonly std: BlockStdScope) {
    super();
  }

  static override setup(di: Container) {
    di.add(this, [StdIdentifier]);
    di.addImpl(EdgelessCRUDIdentifier, provider => provider.get(this));
  }

  private get _gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  private get _surface() {
    return this._gfx.surface as SurfaceBlockModel | null;
  }

  deleteElements = (elements: GfxModel[]) => {
    const surface = this._surface;
    if (!surface) {
      console.error('surface is not initialized');
      return;
    }

    const gfx = this.std.get(GfxControllerIdentifier);
    const set = new Set(elements);
    elements.forEach(element => {
      if (isConnectable(element)) {
        const connectors = surface.getConnectors(element.id);
        connectors.forEach(connector => set.add(connector));
      }
    });

    set.forEach(element => {
      if (isNoteBlock(element)) {
        const children = gfx.doc.root?.children ?? [];
        if (children.length > 1) {
          gfx.doc.deleteBlock(element);
        }
      } else {
        gfx.deleteElement(element.id);
      }
    });
  };

  addBlock = (
    flavour: string,
    props: Record<string, unknown>,
    parentId?: string | BlockModel,
    parentIndex?: number
  ) => {
    const gfx = this.std.get(GfxControllerIdentifier);
    const key = getLastPropsKey(flavour, props);
    if (key) {
      props = this.std.get(EditPropsStore).applyLastProps(key, props);
    }

    const nProps = {
      ...props,
      index: gfx.layer.generateIndex(),
    };

    return this.std.store.addBlock(
      flavour as never,
      nProps,
      parentId,
      parentIndex
    );
  };

  addElement = <T extends Record<string, unknown>>(type: string, props: T) => {
    const surface = this._surface;
    if (!surface) {
      console.error('surface is not initialized');
      return;
    }

    const gfx = this.std.get(GfxControllerIdentifier);
    const key = getLastPropsKey(type, props);
    if (key) {
      props = this.std.get(EditPropsStore).applyLastProps(key, props) as T;
    }

    const nProps = {
      ...props,
      type,
      index: props.index ?? gfx.layer.generateIndex(),
    };

    return surface.addElement(nProps);
  };

  updateElement = (id: string, props: Record<string, unknown>) => {
    const surface = this._surface;
    if (!surface) {
      console.error('surface is not initialized');
      return;
    }

    const element = this._surface.getElementById(id);
    if (element) {
      const key = getLastPropsKey(element.type, {
        ...element.yMap.toJSON(),
        ...props,
      });
      key && this.std.get(EditPropsStore).recordLastProps(key, props);
      this._surface.updateElement(id, props);
      return;
    }

    const block = this.std.store.getModelById(id);
    if (block) {
      const key = getLastPropsKey(block.flavour, {
        ...block.yBlock.toJSON(),
        ...props,
      });
      key && this.std.get(EditPropsStore).recordLastProps(key, props);
      this.std.store.updateBlock(block, props);
    }
  };

  getElementById(id: string): GfxModel | null {
    const surface = this._surface;
    if (!surface) {
      return null;
    }
    const el = surface.getElementById(id) ?? this.std.store.getModelById(id);
    return el as GfxModel | null;
  }

  getElementsByType<K extends keyof SurfaceElementModelMap>(
    type: K
  ): SurfaceElementModelMap[K][] {
    if (!this._surface) {
      return [];
    }
    return this._surface.getElementsByType(type);
  }

  removeElement(id: string | GfxModel) {
    id = typeof id === 'string' ? id : id.id;

    const el = this.getElementById(id);
    if (isGfxGroupCompatibleModel(el)) {
      el.childIds.forEach(childId => {
        this.removeElement(childId);
      });
    }

    if (el instanceof GfxBlockElementModel) {
      this.std.store.deleteBlock(el);
      return;
    }

    if (this._surface?.hasElementById(id)) {
      this._surface.deleteElement(id);
      return;
    }
  }
}
