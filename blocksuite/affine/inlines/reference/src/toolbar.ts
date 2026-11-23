import { ToolbarModuleExtension } from '@blocksuite/affine-shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/std';

import { builtinInlineReferenceToolbarConfig } from './reference-node/configs/toolbar';

export const referenceNodeToolbar = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('affine:reference'),
  config: builtinInlineReferenceToolbarConfig,
});
