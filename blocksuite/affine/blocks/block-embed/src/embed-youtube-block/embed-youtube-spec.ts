import { EmbedYoutubeBlockSchema } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { createBuiltinToolbarConfigExtension } from '../configs/toolbar';
import { EmbedYoutubeBlockAdapterExtensions } from './adapters/extension';
import { embedYoutubeSlashMenuConfig } from './configs/slash-menu';
import { EmbedYoutubeBlockComponent } from './embed-youtube-block';
import {
  EmbedYoutubeBlockOptionConfig,
  EmbedYoutubeBlockService,
} from './embed-youtube-service';

const flavour = EmbedYoutubeBlockSchema.model.flavour;

export const EmbedYoutubeBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  EmbedYoutubeBlockService,
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-youtube-block`
      : literal`affine-embed-youtube-block`;
  }),
  EmbedYoutubeBlockAdapterExtensions,
  EmbedYoutubeBlockOptionConfig,
  createBuiltinToolbarConfigExtension(flavour, EmbedYoutubeBlockComponent),
  SlashMenuConfigExtension('affine:embed-youtube', embedYoutubeSlashMenuConfig),
].flat();
