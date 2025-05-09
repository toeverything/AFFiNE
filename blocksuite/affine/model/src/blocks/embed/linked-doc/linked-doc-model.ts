import { BlockModel } from '@blocksuite/store';

import type { ReferenceInfo } from '../../../consts/doc.js';
import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export const EmbedLinkedDocStyles: EmbedCardStyle[] = [
  'vertical',
  'horizontal',
  'list',
  'cube',
  'horizontalThin',
  'citation',
];

export type EmbedLinkedDocBlockProps = {
  style: EmbedCardStyle;
  caption: string | null;
  footnoteIdentifier: string | null;
} & ReferenceInfo;

export class EmbedLinkedDocModel extends defineEmbedModel<EmbedLinkedDocBlockProps>(
  BlockModel
) {}
