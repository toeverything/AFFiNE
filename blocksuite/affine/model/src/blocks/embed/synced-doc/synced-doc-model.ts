import type { GfxCompatibleProps } from '@blocksuite/std/gfx';
import { BlockModel } from '@blocksuite/store';

import type { ReferenceInfo } from '../../../consts/doc.js';
import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export const EmbedSyncedDocStyles = [
  'syncedDoc',
] as const satisfies EmbedCardStyle[];

export type EmbedSyncedDocBlockProps = {
  style: EmbedCardStyle;
  caption?: string | null;
  scale?: number;
  /**
   * Record the scaled height of the synced doc block when it is folded,
   * a.k.a the fourth number of the `xywh`
   */
  preFoldHeight?: number;
} & ReferenceInfo &
  GfxCompatibleProps;

export class EmbedSyncedDocModel extends defineEmbedModel<EmbedSyncedDocBlockProps>(
  BlockModel
) {
  get isFolded() {
    return !!this.props.preFoldHeight$.value;
  }
}
