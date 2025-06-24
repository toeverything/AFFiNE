import { EmbedLinkedDocBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { LinkedDocSlashMenuConfigExtension } from './configs/slash-menu';
import { createBuiltinToolbarConfigExtension } from './configs/toolbar';
import { EmbedLinkedDocInteraction } from './embed-edgeless-linked-doc-block';

const flavour = EmbedLinkedDocBlockSchema.model.flavour;

export const EmbedLinkedDocViewExtensions: ExtensionType[] = [
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-embed-edgeless-linked-doc-block`
      : literal`affine-embed-linked-doc-block`;
  }),
  createBuiltinToolbarConfigExtension(flavour),
  EmbedLinkedDocInteraction,
  LinkedDocSlashMenuConfigExtension,
].flat();
