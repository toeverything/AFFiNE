import { EmbedIframeBlockSchema } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { EmbedIframeBlockAdapterExtensions } from './adapters';
import { embedIframeSlashMenuConfig } from './configs/slash-menu/slash-menu';
import { createBuiltinToolbarConfigExtension } from './configs/toolbar';

const flavour = EmbedIframeBlockSchema.model.flavour;

export const EmbedIframeBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-iframe-block`
      : literal`affine-embed-iframe-block`;
  }),
  EmbedIframeBlockAdapterExtensions,
  createBuiltinToolbarConfigExtension(flavour),
  SlashMenuConfigExtension(flavour, embedIframeSlashMenuConfig),
].flat();

export const EmbedIframeViewExtensions: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-iframe-block`
      : literal`affine-embed-iframe-block`;
  }),
  createBuiltinToolbarConfigExtension(flavour),
  SlashMenuConfigExtension(flavour, embedIframeSlashMenuConfig),
].flat();
