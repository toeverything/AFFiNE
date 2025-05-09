import { EmbedHtmlBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { createBuiltinToolbarConfigExtension } from './configs/toolbar';

const flavour = EmbedHtmlBlockSchema.model.flavour;

export const EmbedHtmlBlockSpec: ExtensionType[] = [
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-html-block`
      : literal`affine-embed-html-block`;
  }),
  createBuiltinToolbarConfigExtension(flavour),
].flat();

export const EmbedHtmlViewExtensions: ExtensionType[] = [
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-html-block`
      : literal`affine-embed-html-block`;
  }),
  createBuiltinToolbarConfigExtension(flavour),
].flat();
