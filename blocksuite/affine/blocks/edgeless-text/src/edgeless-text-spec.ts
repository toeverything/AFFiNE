import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

export const EdgelessTextBlockSpec: ExtensionType[] = [
  BlockViewExtension('affine:edgeless-text', literal`affine-edgeless-text`),
];
