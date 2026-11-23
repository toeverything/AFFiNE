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

  expect(extractEmojiIcon('➡️456')).toEqual({
    emoji: '➡️',
    rest: '456',
  });

  expect(extractEmojiIcon('✈️789')).toEqual({
    emoji: '✈️',
    rest: '789',
  });

  expect(extractEmojiIcon('plain text')).toEqual({
    emoji: null,
    rest: 'plain text',
  });
});
