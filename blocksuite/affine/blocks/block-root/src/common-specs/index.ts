import { FileDropExtension } from '@blocksuite/affine-components/drop-indicator';
import { NoteBlockSchema } from '@blocksuite/affine-model';
import {
  DNDAPIExtension,
  DocModeService,
  EmbedOptionService,
  PageViewportServiceExtension,
  ThemeService,
  ToolbarModuleExtension,
  ToolbarRegistryExtension,
} from '@blocksuite/affine-shared/services';
import { dragHandleWidget } from '@blocksuite/affine-widget-drag-handle';
import { docRemoteSelectionWidget } from '@blocksuite/affine-widget-remote-selection';
import { scrollAnchoringWidget } from '@blocksuite/affine-widget-scroll-anchoring';
import { SlashMenuExtension } from '@blocksuite/affine-widget-slash-menu';
import { toolbarWidget } from '@blocksuite/affine-widget-toolbar';
import {
  BlockFlavourIdentifier,
  FlavourExtension,
} from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';

import { RootBlockAdapterExtensions } from '../adapters/extension';
import { clipboardConfigs } from '../clipboard';
import { builtinToolbarConfig } from '../configs/toolbar';
import {
  innerModalWidget,
  linkedDocWidget,
  modalWidget,
  viewportOverlayWidget,
} from './widgets';

export const CommonSpecs: ExtensionType[] = [
  FlavourExtension('affine:page'),
  DocModeService,
  ThemeService,
  EmbedOptionService,
  PageViewportServiceExtension,
  DNDAPIExtension,
  FileDropExtension,
  ToolbarRegistryExtension,
  ...RootBlockAdapterExtensions,
  ...clipboardConfigs,

  modalWidget,
  innerModalWidget,
  SlashMenuExtension,
  linkedDocWidget,
  dragHandleWidget,
  docRemoteSelectionWidget,
  viewportOverlayWidget,
  scrollAnchoringWidget,
  toolbarWidget,

  ToolbarModuleExtension({
    id: BlockFlavourIdentifier(NoteBlockSchema.model.flavour),
    config: builtinToolbarConfig,
  }),
];

export * from './widgets';
