import type { FrameBlockModel } from '@blocksuite/affine-model';
import type { BlockComponent } from '@blocksuite/block-std';
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx';
import { BlockSuiteError } from '@blocksuite/global/exceptions';

import { EdgelessFrameTitleEditor } from './edgeless-frame-title-editor';

export function mountFrameTitleEditor(
  frame: FrameBlockModel,
  edgeless: BlockComponent
) {
  const mountElm = edgeless.querySelector('.edgeless-mount-point');
  if (!mountElm) {
    throw new BlockSuiteError(
      BlockSuiteError.ErrorCode.ValueNotExists,
      "edgeless block's mount point does not exist"
    );
  }

  const gfx = edgeless.std.get(GfxControllerIdentifier);

  // @ts-expect-error TODO: refactor gfx tool
  gfx.tool.setTool('default');
  gfx.selection.set({
    elements: [frame.id],
    editing: true,
  });

  const frameEditor = new EdgelessFrameTitleEditor();
  frameEditor.frameModel = frame;
  frameEditor.edgeless = edgeless;

  mountElm.append(frameEditor);
}
