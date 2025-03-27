import { edgelessTextToolbarExtension } from '@blocksuite/affine-block-edgeless-text';
import { frameToolbarExtension } from '@blocksuite/affine-block-frame';
import { brushToolbarExtension } from '@blocksuite/affine-gfx-brush';
import { connectorToolbarExtension } from '@blocksuite/affine-gfx-connector';
import { groupToolbarExtension } from '@blocksuite/affine-gfx-group';
import { mindmapToolbarExtension } from '@blocksuite/affine-gfx-mindmap';
import { shapeToolbarExtension } from '@blocksuite/affine-gfx-shape';
import { textToolbarExtension } from '@blocksuite/affine-gfx-text';
import { ToolbarModuleExtension } from '@blocksuite/affine-shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';

import { builtinLockedToolbarConfig, builtinMiscToolbarConfig } from './misc';

export const EdgelessElementToolbarExtension: ExtensionType[] = [
  frameToolbarExtension,

  groupToolbarExtension,

  brushToolbarExtension,

  connectorToolbarExtension,

  mindmapToolbarExtension,

  textToolbarExtension,

  edgelessTextToolbarExtension,

  shapeToolbarExtension,

  ToolbarModuleExtension({
    id: BlockFlavourIdentifier('affine:surface:*'),
    config: builtinMiscToolbarConfig,
  }),

  // Special Scenarios
  // Only display the `unlock` button when the selection includes a locked element.
  ToolbarModuleExtension({
    id: BlockFlavourIdentifier('affine:surface:locked'),
    config: builtinLockedToolbarConfig,
  }),
];
