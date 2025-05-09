import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { DividerBlockAdapterExtensions } from './adapters/extension.js';

export const DividerBlockSpec: ExtensionType[] = [
  BlockViewExtension('affine:divider', literal`affine-divider`),
  DividerBlockAdapterExtensions,
].flat();
