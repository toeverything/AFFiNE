import {
  DefaultTool,
  EdgelessCRUDIdentifier,
  SurfaceBlockComponent,
} from '@blocksuite/affine/blocks/surface';
import { Bound, Vec } from '@blocksuite/affine/global/gfx';
import {
  type BlockStdScope,
  BlockSelection,
  SurfaceSelection,
  TextSelection,
} from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';

import { HELLO_WIDGET_SIZE } from './const';
import { isBoardReadonly } from './infra/permissions';

export function insertGfxWidget(
  std: BlockStdScope,
  flavour: string,
  props: Record<string, unknown> = {},
  size: { width: number; height: number } = HELLO_WIDGET_SIZE
): string | undefined {
  if (isBoardReadonly(std.store)) return;
  const gfx = std.getOptional(GfxControllerIdentifier);
  const crud = std.getOptional(EdgelessCRUDIdentifier);
  const surfaceBlock = gfx?.surfaceComponent;

  if (gfx && crud && surfaceBlock instanceof SurfaceBlockComponent) {
    const center = Vec.toVec(surfaceBlock.renderer.viewport.center);
    const blockId = crud.addBlock(
      flavour,
      {
        ...props,
        xywh: Bound.fromCenter(center, size.width, size.height).serialize(),
      },
      surfaceBlock.model
    );
    gfx.tool.setTool(DefaultTool);
    gfx.selection.set({
      elements: [blockId],
      editing: false,
    });
    return blockId;
  }

  const { host } = std;
  const selectionManager = host.selection;
  const textSelection = selectionManager.find(TextSelection);
  const blockSelection = selectionManager.find(BlockSelection);
  const surfaceSelection = selectionManager.find(SurfaceSelection);

  let anchorId: string | undefined;
  if (textSelection) {
    anchorId = textSelection.blockId;
  } else if (blockSelection) {
    anchorId = blockSelection.blockId;
  } else if (surfaceSelection?.editing) {
    anchorId = surfaceSelection.blockId;
  }

  if (!anchorId) return;

  const block = host.view.getBlock(anchorId);
  if (!block) return;
  const parent = host.store.getParent(block.model);
  if (!parent) return;
  const index = parent.children.indexOf(block.model);
  return host.store.addBlock(flavour as never, props, parent, index + 1);
}
