import { AttachmentBlockModel } from '@blocksuite/affine/model';
import type { BlockModel } from '@blocksuite/affine/store';
import type { GfxModel } from '@blocksuite/std/gfx';

export function isAttachment(
  model: GfxModel | BlockModel
): model is AttachmentBlockModel {
  return model instanceof AttachmentBlockModel;
}
