import { IS_SAFARI } from '@blocksuite/global/env';

export const ZERO_WIDTH_FOR_EMPTY_LINE = IS_SAFARI ? '\u200C' : '\u200B';
export const ZERO_WIDTH_FOR_EMBED_NODE = IS_SAFARI ? '\u200B' : '\u200C';

export const INLINE_ROOT_ATTR = 'data-v-root';
