import type { GfxCompatibleProps } from '@blocksuite/std/gfx';
import { BlockModel } from '@blocksuite/store';

import type { ReferenceInfo } from '../../../consts/doc.js';
import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export const EmbedSyncedDocStyles: EmbedCardStyle[] = ['syncedDoc'];

export type EmbedSyncedDocBlockProps = {
  style: EmbedCardStyle;
  caption?: string | null;
  scale?: number;
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
