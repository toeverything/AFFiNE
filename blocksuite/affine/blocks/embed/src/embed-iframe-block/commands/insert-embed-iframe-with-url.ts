import {
  DefaultTool,
  EdgelessCRUDIdentifier,
  SurfaceBlockComponent,
} from '@blocksuite/affine-block-surface';
import { EmbedIframeService } from '@blocksuite/affine-shared/services';
import { Bound, Vec } from '@blocksuite/global/gfx';
import {
  BlockSelection,
  type Command,
  SurfaceSelection,
  TextSelection,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';

import {
  EMBED_IFRAME_DEFAULT_HEIGHT_IN_SURFACE,
  EMBED_IFRAME_DEFAULT_WIDTH_IN_SURFACE,
} from '../consts';

export const insertEmbedIframeWithUrlCommand: Command<
  { url: string },
  { blockId: string; flavour: string }
> = (ctx, next) => {
  const { url, std } = ctx;
  const embedIframeService = std.get(EmbedIframeService);
  if (!embedIframeService || !embedIframeService.canEmbed(url)) {
    return;
  }

  const config = embedIframeService.getConfig(url);
  if (!config) {
    return;
  }

  const { host } = std;
  const selectionManager = host.selection;

  let selectedBlockId: string | undefined;
  const textSelection = selectionManager.find(TextSelection);
  const blockSelection = selectionManager.find(BlockSelection);
  const surfaceSelection = selectionManager.find(SurfaceSelection);
  if (textSelection) {
    selectedBlockId = textSelection.blockId;
  } else if (blockSelection) {
    selectedBlockId = blockSelection.blockId;
  } else if (surfaceSelection && surfaceSelection.editing) {
    selectedBlockId = surfaceSelection.blockId;
  }

  const flavour = 'affine:embed-iframe';
  const props: Record<string, unknown> = { url };
  // When there is a selected block, it means that the selection is in note or edgeless text
  // we should insert the embed iframe block after the selected block and only need the url prop
  let newBlockId: string | undefined;
  if (selectedBlockId) {
    const block = host.view.getBlock(selectedBlockId);
    if (!block) return;
    const parent = host.store.getParent(block.model);
    if (!parent) return;
    const index = parent.children.indexOf(block.model);
    newBlockId = host.store.addBlock(flavour, props, parent, index + 1);
  } else {
    // When there is no selected block and in edgeless mode
    // We should insert the embed iframe block to surface
    // It means that not only the url prop but also the xywh prop is needed
    const rootId = std.store.root?.id;
    if (!rootId) return;
    const edgelessRoot = std.view.getBlock(rootId);
    if (!edgelessRoot) return;

    const gfx = std.get(GfxControllerIdentifier);
    const crud = std.get(EdgelessCRUDIdentifier);

    gfx.viewport.smoothZoom(1);
    const surfaceBlock = gfx.surfaceComponent;
    if (!(surfaceBlock instanceof SurfaceBlockComponent)) return;

    const options = config.options;
    const { widthInSurface, heightInSurface } = options ?? {};
    const width = widthInSurface ?? EMBED_IFRAME_DEFAULT_WIDTH_IN_SURFACE;
    const height = heightInSurface ?? EMBED_IFRAME_DEFAULT_HEIGHT_IN_SURFACE;
    const center = Vec.toVec(surfaceBlock.renderer.viewport.center);
    const xywh = Bound.fromCenter(center, width, height).serialize();
    newBlockId = crud.addBlock(
      flavour,
      {
        ...props,
        xywh,
      },
      surfaceBlock.model
    );

    gfx.tool.setTool(DefaultTool);

    gfx.selection.set({
      elements: [newBlockId],
      editing: false,
    });
  }

  if (!newBlockId) {
    return;
  }

  next({ blockId: newBlockId, flavour });
};
