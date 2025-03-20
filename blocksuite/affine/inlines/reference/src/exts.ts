import type { ExtensionType } from '@blocksuite/store';

import { ReferenceInlineSpecExtension } from './inline-spec';
import { RefNodeSlotsExtension } from './reference-node';
import { referenceNodeToolbar } from './toolbar';

export const inlineReferenceExtensions: ExtensionType[] = [
  referenceNodeToolbar,
  ReferenceInlineSpecExtension,
  RefNodeSlotsExtension,
];
