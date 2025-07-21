import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

export const ColumnBlockSpec: ExtensionType[] = [
  BlockViewExtension('affine:column', literal`affine-column`),
];

export const ColumnBlockConfig = {
  flavour: 'affine:column',
  tag: 'affine-column',
};
