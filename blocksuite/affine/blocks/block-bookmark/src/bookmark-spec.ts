import { BookmarkBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { BookmarkBlockAdapterExtensions } from './adapters/extension';
import { BookmarkSlashMenuConfigExtension } from './configs/slash-menu';
import { createBuiltinToolbarConfigExtension } from './configs/toolbar';

const flavour = BookmarkBlockSchema.model.flavour;

export const BookmarkBlockSpec: ExtensionType[] = [
  FlavourExtension(flavour),
  BlockViewExtension(flavour, model => {
    return model.parent?.flavour === 'affine:surface'
      ? literal`affine-edgeless-bookmark`
      : literal`affine-bookmark`;
  }),
  BookmarkBlockAdapterExtensions,
  createBuiltinToolbarConfigExtension(flavour),
  BookmarkSlashMenuConfigExtension,
].flat();
