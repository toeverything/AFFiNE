import { isNoteBlock } from '@blocksuite/affine-block-surface';
import type { Connectable } from '@blocksuite/affine-model';
import type { GfxModel } from '@blocksuite/std/gfx';

import type { EdgelessRootBlockComponent } from '../index.js';
import { isConnectable } from './query.js';

/**
 * Use deleteElementsV2 instead.
 * @deprecated
 */
export function deleteElements(
  edgeless: EdgelessRootBlockComponent,
  elements: GfxModel[]
) {
  const set = new Set(elements);
  const { service } = edgeless;

  elements.forEach(element => {
    if (isConnectable(element)) {
      const connectors = service.getConnectors(element as Connectable);
      connectors.forEach(connector => set.add(connector));
    }
  });

  set.forEach(element => {
    if (isNoteBlock(element)) {
      const children = edgeless.store.root?.children ?? [];
      // FIXME: should always keep at least 1 note
      if (children.length > 1) {
        edgeless.store.deleteBlock(element);
      }
    } else {
      service.removeElement(element.id);
    }
  });
}
