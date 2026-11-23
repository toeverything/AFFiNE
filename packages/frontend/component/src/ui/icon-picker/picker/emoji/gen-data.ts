import compactEmojis from 'emojibase-data/en/compact.json';

import { type GroupName, GROUPS } from './constants';
import type { CompactEmoji } from './type';

const emojiGroupObj = GROUPS.reduce(
  (acc, name) => ({
    ...acc,
    [name]: {
      emojis: [] as CompactEmoji[],
    },
  }),
  {} as Record<GroupName, { emojis: CompactEmoji[] }>
);
compactEmojis.forEach((emoji: CompactEmoji) => {
  const group = emoji.group;
  if (group === undefined) return;

  switch (group) {
    case 0:
    case 1:
      emojiGroupObj['Smileys & People'].emojis.push(emoji);
      break;
    case 2:
      // 🏻🏼🏽🏾🏿🦰🦱🦳🦲
      break;
    case 3:
      emojiGroupObj['Animals & Nature'].emojis.push(emoji);
      break;
    case 4:
      emojiGroupObj['Food & Drink'].emojis.push(emoji);
      break;
    case 5:
      emojiGroupObj['Travel & Places'].emojis.push(emoji);
      break;
    case 6:
      emojiGroupObj['Activity'].emojis.push(emoji);
      break;
    case 7:
      emojiGroupObj['Objects'].emojis.push(emoji);
      break;
    case 8:
      emojiGroupObj['Symbols'].emojis.push(emoji);
      break;
    case 9:
      emojiGroupObj['Flags'].emojis.push(emoji);
      break;
  }
});

export const emojiGroupList = GROUPS.map(name => ({
  name,
  emojis: emojiGroupObj[name].emojis.sort((a, b) => a.order - b.order),
}));

// it may take 300~500ms to group and sort the emojis in runtime
// so for now we just generate the data in build time
// and save it to ./data
console.log(JSON.stringify(emojiGroupList));
