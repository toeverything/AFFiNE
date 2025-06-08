import { expect, test } from 'vitest';

import { extractEmojiIcon } from '../extract-emoji-icon';

test('extract-emoji-icon', () => {
  expect(extractEmojiIcon('👨🏻‍❤️‍💋‍👨🏻123')).toEqual({
    emoji: '👨🏻‍❤️‍💋‍👨🏻',
    rest: '123',
  });

  expect(extractEmojiIcon('❤️123')).toEqual({
    emoji: '❤️',
    rest: '123',
  });
});
