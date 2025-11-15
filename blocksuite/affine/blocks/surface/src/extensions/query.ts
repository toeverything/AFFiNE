import type { Connectable, NoteBlockModel } from '@blocksuite/affine-model';
import type { GfxModel } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

export function isConnectable(
  element: GfxModel | null
): element is Connectable {
  return !!element && element.connectable;
}

export function isNoteBlock(
  element: BlockModel | GfxModel | null
): element is NoteBlockModel {
  return !!element && 'flavour' in element && element.flavour === 'affine:note';
}
