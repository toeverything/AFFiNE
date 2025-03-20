import { EmbedFigmaBlockSchema } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { createBuiltinToolbarConfigExtension } from '../configs/toolbar';
import { EmbedFigmaBlockAdapterExtensions } from './adapters/extension';
import { embedFigmaSlashMenuConfig } from './configs/slash-menu';
import { EmbedFigmaBlockComponent } from './embed-figma-block';
import { EmbedFigmaBlockOptionConfig } from './embed-figma-service';

const flavour = EmbedFigmaBlockSchema.model.flavour;

export const EmbedFigmaBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-figma-block`
      : literal`affine-embed-figma-block`;
  }),
  EmbedFigmaBlockAdapterExtensions,
  EmbedFigmaBlockOptionConfig,
  createBuiltinToolbarConfigExtension(flavour, EmbedFigmaBlockComponent),
  SlashMenuConfigExtension(flavour, embedFigmaSlashMenuConfig),
].flat();
