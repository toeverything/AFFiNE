import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

export const MultiColumnContainerBlockSpec: ExtensionType[] = [
  BlockViewExtension(
    'affine:multi-column-container',
    literal`affine-multi-column-container`
  ),
];

export const MultiColumnContainerBlockConfig = {
  flavour: 'affine:multi-column-container',
  tag: 'affine-multi-column-container',
};
