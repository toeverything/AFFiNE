import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

export const DataViewBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:data-view'),
  BlockViewExtension('affine:data-view', literal`affine-data-view`),
];
