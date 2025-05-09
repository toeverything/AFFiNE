import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { LatexBlockAdapterExtensions } from './adapters/extension.js';
import { latexSlashMenuConfig } from './configs/slash-menu.js';

export const LatexBlockSpec: ExtensionType[] = [
  BlockViewExtension('affine:latex', literal`affine-latex`),
  LatexBlockAdapterExtensions,
  SlashMenuConfigExtension('affine:latex', latexSlashMenuConfig),
].flat();
