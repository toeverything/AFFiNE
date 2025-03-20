import { ToolbarModuleExtension } from '@blocksuite/affine-shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/block-std';

import { builtinInlineLinkToolbarConfig } from './link-node/configs/toolbar.js';

export const linkToolbar = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('affine:link'),
  config: builtinInlineLinkToolbarConfig,
});
