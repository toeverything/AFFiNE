import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { ListBlockAdapterExtensions } from './adapters/extension.js';
import { ListKeymapExtension, ListTextKeymapExtension } from './list-keymap.js';

export const ListBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:list'),
  BlockViewExtension('affine:list', literal`affine-list`),
  ListKeymapExtension,
  ListTextKeymapExtension,
  ListBlockAdapterExtensions,
].flat();
