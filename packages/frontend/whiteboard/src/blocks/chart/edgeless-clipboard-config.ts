import { EdgelessClipboardConfig } from '@blocksuite/affine/blocks/surface';
import type { BlockSnapshot } from '@blocksuite/affine/store';

import { ChartBlockSchema } from './model';

export class EdgelessClipboardChartConfig extends EdgelessClipboardConfig {
  static override readonly key = ChartBlockSchema.model.flavour;

  override createBlock(block: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const {
      xywh,
      rotate,
      scale,
      title,
      chartType,
      spec,
      dataSource,
      snapshotBlobId,
      liveBudgetExempt,
    } = block.props;
    return this.crud.addBlock(
      ChartBlockSchema.model.flavour,
      {
        xywh,
        rotate,
        scale,
        title,
        chartType,
        spec,
        dataSource,
        snapshotBlobId,
        liveBudgetExempt,
      },
      this.surface.model.id
    );
  }
}
