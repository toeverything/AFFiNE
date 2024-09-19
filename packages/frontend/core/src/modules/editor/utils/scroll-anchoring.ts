import { notify } from '@affine/component';
import { I18n } from '@affine/i18n';
import type { BlockStdScope } from '@blocksuite/block-std';
import {
  GfxControllerIdentifier,
  type GfxModel,
} from '@blocksuite/block-std/gfx';
import type { DocMode } from '@blocksuite/blocks';

// TODO(@fundon): it should be a command
export function scrollAnchoring(std: BlockStdScope, mode: DocMode, id: string) {
  let key = 'blockIds';
  let exists = false;

  if (mode === 'page') {
    exists = std.doc.hasBlock(id);
  } else {
    const controller = std.getOptional(GfxControllerIdentifier);
    if (!controller) return;

    exists = !!controller.getElementById<GfxModel>(id)?.xywh;
    if (controller.surface?.hasElementById(id)) {
      key = 'elementIds';
    }
  }

  if (!exists) {
    notify.error({
      title: I18n['Block not found'](),
      message: I18n['Block not found description'](),
    });
    return;
  }

  const selection = std.selection;

  selection.setGroup('scene', [
    selection.create('highlight', {
      mode,
      [key]: [id],
    }),
  ]);
}
