import type { ParagraphBlockModel } from '@blocksuite/affine-model';
import { ConfigExtensionFactory } from '@blocksuite/block-std';

export interface ParagraphBlockConfig {
  getPlaceholder: (model: ParagraphBlockModel) => string;
}

export const ParagraphBlockConfigExtension =
  ConfigExtensionFactory<ParagraphBlockConfig>('affine:paragraph');
