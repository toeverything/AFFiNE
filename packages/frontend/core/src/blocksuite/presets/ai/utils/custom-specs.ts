import { BlockViewIdentifier, type ExtensionType } from '@blocksuite/block-std';
import { PageEditorBlockSpecs } from '@blocksuite/blocks';
import { literal } from 'lit/static-html.js';

export const CustomPageEditorBlockSpecs: ExtensionType[] = [
  ...PageEditorBlockSpecs,
  {
    setup: di => {
      di.override(
        BlockViewIdentifier('affine:page'),
        () => literal`affine-page-root`
      );
    },
  },
];
