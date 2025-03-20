import type { ExtensionType } from '@blocksuite/store';

import { LinkInlineSpecExtension } from './inline-spec';
import { linkToolbar } from './toolbar';

export const inlineLinkExtensions: ExtensionType[] = [
  LinkInlineSpecExtension,
  linkToolbar,
];
