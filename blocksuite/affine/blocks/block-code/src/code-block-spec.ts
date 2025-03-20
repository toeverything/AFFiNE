import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import {
  BlockViewExtension,
  FlavourExtension,
  WidgetViewExtension,
} from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { CodeBlockAdapterExtensions } from './adapters/extension.js';
import {
  CodeBlockInlineManagerExtension,
  CodeBlockUnitSpecExtension,
} from './code-block-inline.js';
import { CodeBlockHighlighter } from './code-block-service.js';
import { CodeKeymapExtension } from './code-keymap.js';
import { AFFINE_CODE_TOOLBAR_WIDGET } from './code-toolbar/index.js';
import { codeSlashMenuConfig } from './configs/slash-menu.js';

export const codeToolbarWidget = WidgetViewExtension(
  'affine:code',
  AFFINE_CODE_TOOLBAR_WIDGET,
  literal`${unsafeStatic(AFFINE_CODE_TOOLBAR_WIDGET)}`
);

export const CodeBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:code'),
  CodeBlockHighlighter,
  BlockViewExtension('affine:code', literal`affine-code`),
  codeToolbarWidget,
  CodeBlockInlineManagerExtension,
  CodeBlockUnitSpecExtension,
  CodeBlockAdapterExtensions,
  SlashMenuConfigExtension('affine:code', codeSlashMenuConfig),
  CodeKeymapExtension,
].flat();
