import { TableModelFlavour } from '@blocksuite/affine-model';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { TableBlockAdapterExtensions } from './adapters/extension.js';
import { tableSlashMenuConfig } from './configs/slash-menu.js';

export const TableBlockSpec: ExtensionType[] = [
  FlavourExtension(TableModelFlavour),
  BlockViewExtension(TableModelFlavour, literal`affine-table`),
  TableBlockAdapterExtensions,
  SlashMenuConfigExtension(TableModelFlavour, tableSlashMenuConfig),
].flat();
