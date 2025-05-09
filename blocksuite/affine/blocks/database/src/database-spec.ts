import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { DatabaseBlockAdapterExtensions } from './adapters/extension.js';
import { databaseSlashMenuConfig } from './configs/slash-menu.js';

export const DatabaseBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:database'),
  BlockViewExtension('affine:database', literal`affine-database`),
  DatabaseBlockAdapterExtensions,
  SlashMenuConfigExtension('affine:database', databaseSlashMenuConfig),
].flat();
