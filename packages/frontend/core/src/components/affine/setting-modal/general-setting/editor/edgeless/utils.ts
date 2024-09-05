import type { SurfaceBlockModel } from '@blocksuite/block-std/gfx';
import type { FrameBlockModel } from '@blocksuite/blocks';
import type { Doc } from '@blocksuite/store';

export function getSurfaceBlock(doc: Doc) {
  const blocks = doc.getBlocksByFlavour('affine:surface');
  return blocks.length !== 0 ? (blocks[0].model as SurfaceBlockModel) : null;
}

export function getFrameBlock(doc: Doc) {
  const blocks = doc.getBlocksByFlavour('affine:frame');
  return blocks.length !== 0 ? (blocks[0].model as FrameBlockModel) : null;
}
