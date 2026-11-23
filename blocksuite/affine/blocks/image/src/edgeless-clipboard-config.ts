import { EdgelessClipboardConfig } from '@blocksuite/affine-block-surface';
import { type BlockSnapshot } from '@blocksuite/store';

export class EdgelessClipboardImageConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:image';

  override async createBlock(image: BlockSnapshot) {
    const { xywh, rotate, sourceId, size, width, height, caption } =
      image.props;

    if (!this.surface) return null;

    if (!(await this.std.workspace.blobSync.get(sourceId as string))) {
      return null;
    }
    return this.crud.addBlock(
      'affine:image',
      {
        caption,
        sourceId,
        xywh,
        rotate,
        size,
        width,
        height,
      },
      this.surface.model.id
    );
  }
}
