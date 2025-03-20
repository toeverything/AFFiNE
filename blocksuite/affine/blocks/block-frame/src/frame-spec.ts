import { FrameBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { EdgelessFrameManager, FrameOverlay } from './frame-manager';

const flavour = FrameBlockSchema.model.flavour;

export const FrameBlockSpec: ExtensionType[] = [
  BlockViewExtension(flavour, literal`affine-frame`),
  FrameOverlay,
  EdgelessFrameManager,
];
