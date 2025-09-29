import { SearchIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useState } from 'react';

import { IconButton } from '../../../button';
import Input from '../../../input';
import { Menu } from '../../../menu';
import * as pickerStyles from '../picker.css';
// import { emojiGroupList } from './gen-data';
import * as styles from './emoji-picker.css';
import { EmojiGroups } from './groups';
import { useRecentEmojis } from './recent';

const skinList = [
  { unicode: '👋', value: undefined },
  { unicode: '👋🏻', value: 0 },
  { unicode: '👋🏼', value: 1 },
  { unicode: '👋🏽', value: 2 },
  { unicode: '👋🏾', value: 3 },
  { unicode: '👋🏿', value: 4 },
];

export const EmojiPicker = ({
  onSelect,
}: {
  onSelect?: (emoji: string) => void;
}) => {
  const [keyword, setKeyword] = useState<string>('');

  const [skin, setSkin] = useState<number | undefined>(undefined);
  const { add: addRecent, recentEmojis } = useRecentEmojis();

  // const checkActiveGroup = useCallback(() => {
  //   const scrollable = scrollableRef.current;
  //   if (!scrollable) return;

  //   // get actual scrollable element
  //   const viewport = scrollable.querySelector(
  //     '[data-radix-scroll-area-viewport]'
  //   ) as HTMLElement;
  //   if (!viewport) return;

  //   const scrollTop = viewport.scrollTop;

  //   // find the first group that is at the top of the scrollable element
  //   for (let i = emojiGroupList.length - 1; i >= 0; i--) {
  //     const group = emojiGroupList[i];
  //     const groupElement = viewport.querySelector(
  //       `[data-group-name="${group.name}"]`
  //     ) as HTMLElement;
  //     if (!groupElement) continue;

  //     // use offsetTop to get the position of the element relative to the scrollable element
  //     const elementTop = groupElement.offsetTop;

  //     if (elementTop <= scrollTop + 50) {
  //       setActiveGroupId(group.name);
  //       return;
  //     }
  //   }
  // }, []);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      addRecent(emoji);
      onSelect?.(emoji);
    },
    [addRecent, onSelect]
  );

  return (
    <div className={pickerStyles.root}>
      <header className={pickerStyles.searchContainer}>
        <Input
          value={keyword}
          onChange={setKeyword}
          className={pickerStyles.searchInput}
          preFix={
            <div style={{ marginLeft: 10, lineHeight: 0 }}>
              <SearchIcon
                style={{ color: cssVarV2.icon.primary, fontSize: 16 }}
              />
            </div>
          }
          placeholder="Filter..."
        />
        <Menu
          contentOptions={{
            align: 'center',
            side: 'bottom',
            sideOffset: 4,
            style: { minWidth: 140 },
          }}
          items={
            <ul className={styles.skinList}>
              {skinList.map(skin => (
                <IconButton
                  key={skin.unicode}
                  className={styles.skinItem}
                  style={{ padding: 3 }}
                  size={18}
                  icon={<span>{skin.unicode}</span>}
                  onClick={() => setSkin(skin.value)}
                />
              ))}
            </ul>
          }
        >
          <IconButton
            size={18}
            style={{
              width: 32,
              height: 32,
              border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
            }}
            icon={
              <span>
                {skin !== undefined
                  ? skinList[skin + 1].unicode
                  : skinList[0].unicode}
              </span>
            }
          />
        </Menu>
      </header>
      {/* <Scrollable.Root className={pickerStyles.scrollRoot} ref={scrollableRef}>
        <Scrollable.Viewport
          onScrollEnd={checkActiveGroup}
          className={pickerStyles.scrollViewport}
        > */}
      {/* Recent */}
      {/* {recentEmojis.length ? (
        <div className={pickerStyles.group}>
          <div className={pickerStyles.groupName} data-group-name="Recent">
            Recent
          </div>
          <div className={pickerStyles.groupGrid}>
            {recentEmojis.map(emoji => (
              <EmojiButton
                key={emoji}
                emoji={emoji}
                onSelect={handleEmojiSelect}
              />
            ))}
          </div>
        </div>
      ) : null} */}

      {/* Groups */}
      <EmojiGroups
        recent={recentEmojis}
        onSelect={handleEmojiSelect}
        keyword={keyword}
        skin={skin}
      />
      {/* </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root> */}
    </div>
  );
};
