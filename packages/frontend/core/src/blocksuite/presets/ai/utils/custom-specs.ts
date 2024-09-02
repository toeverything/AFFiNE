import {
  BlockFlavourIdentifier,
  BlockServiceIdentifier,
  BlockViewIdentifier,
  type ExtensionType,
  StdIdentifier,
} from '@blocksuite/block-std';
import { PageEditorBlockSpecs, PageRootService } from '@blocksuite/blocks';
import { literal } from 'lit/static-html.js';

/**
 * Custom PageRootService that does not load fonts
 */
class CustomPageRootService extends PageRootService {
  override loadFonts() {}
}

export const CustomPageEditorBlockSpecs: ExtensionType[] = [
  ...PageEditorBlockSpecs,
  {
    setup: di => {
      di.override(
        BlockServiceIdentifier('affine:page'),
        CustomPageRootService,
        [StdIdentifier, BlockFlavourIdentifier('affine:page')]
      );
      di.override(
        BlockViewIdentifier('affine:page'),
        () => literal`affine-page-root`
      );
    },
  },
];
