import { EdgelessClipboardConfig } from '@blocksuite/affine/blocks/surface';
import type { BlockSnapshot } from '@blocksuite/affine/store';

import { HelloBlockSchema } from './model';

export class EdgelessClipboardHelloConfig extends EdgelessClipboardConfig {
  static override readonly key = HelloBlockSchema.model.flavour;

  override createBlock(block: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const { xywh, rotate, scale, title, snapshotBlobId } = block.props;
    return this.crud.addBlock(
      HelloBlockSchema.model.flavour,
      {
        xywh,
        rotate,
        scale,
        title,
        snapshotBlobId,
      },
      this.surface.model.id
    );
  }
}
