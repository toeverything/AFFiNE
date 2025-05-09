import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { CalloutBlockMarkdownAdapterExtension } from './adapters/markdown';
import { CalloutKeymapExtension } from './callout-keymap';
import { calloutSlashMenuConfig } from './configs/slash-menu';

export const CalloutBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:callout'),
  BlockViewExtension('affine:callout', literal`affine-callout`),
  CalloutKeymapExtension,
  SlashMenuConfigExtension('affine:callout', calloutSlashMenuConfig),
  CalloutBlockMarkdownAdapterExtension,
];
