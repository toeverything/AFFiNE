import { EdgelessClipboardConfig } from '@blocksuite/affine/blocks/surface';
import type { BlockSnapshot } from '@blocksuite/affine/store';

import { BoardBlockSchema } from './model';

export class EdgelessClipboardBoardConfig extends EdgelessClipboardConfig {
  static override readonly key = BoardBlockSchema.model.flavour;

  override createBlock(block: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const {
      xywh,
      rotate,
      scale,
      title,
      linkedDocId,
      blockId,
      template,
      snapshotBlobId,
    } = block.props;
    return this.crud.addBlock(
      BoardBlockSchema.model.flavour,
      {
        xywh,
        rotate,
        scale,
        title,
        linkedDocId,
        blockId,
        template,
        snapshotBlobId,
      },
      this.surface.model.id
    );
  }
}
