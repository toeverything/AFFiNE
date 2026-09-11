import { EdgelessClipboardConfig } from '@blocksuite/affine/blocks/surface';
import type { BlockSnapshot } from '@blocksuite/affine/store';

import { SketchBlockSchema } from './model';

export class EdgelessClipboardSketchConfig extends EdgelessClipboardConfig {
  static override readonly key = SketchBlockSchema.model.flavour;

  override createBlock(block: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const {
      xywh,
      rotate,
      scale,
      title,
      sceneBlobId,
      assets,
      revision,
      snapshotSvgBlobId,
      liveBudgetExempt,
    } = block.props;
    // New subdocGuid is created on attach so paste does not alias the CRDT.
    return this.crud.addBlock(
      SketchBlockSchema.model.flavour,
      {
        xywh,
        rotate,
        scale,
        title,
        sceneBlobId,
        assets,
        revision,
        snapshotSvgBlobId,
        liveBudgetExempt,
      },
      this.surface.model.id
    );
  }
}
