import { IS_SAFARI } from '@blocksuite/global/env';

export const ZERO_WIDTH_SPACE = IS_SAFARI ? '\u200C' : '\u200B';
// see https://en.wikipedia.org/wiki/Zero-width_non-joiner
export const ZERO_WIDTH_NON_JOINER = '\u200C';

export const INLINE_ROOT_ATTR = 'data-v-root';
