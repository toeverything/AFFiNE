import { RecentIcon, SearchIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { IconButton } from '../../../button';
import Input from '../../../input';
import { Loading } from '../../../loading';
import { Menu } from '../../../menu';
import { Scrollable } from '../../../scrollbar';
import * as pickerStyles from '../picker.css';
import { GROUP_ICON_MAP, type GroupName, GROUPS } from './constants';
import rawData from './data/en.json';
// import { emojiGroupList } from './gen-data';
import * as styles from './emoji-picker.css';
import type { CompactEmoji } from './type';

type EmojiGroup = {
  name: string;
  emojis: Array<CompactEmoji>;
};
const emojiGroupList = rawData as EmojiGroup[];

const useRecentEmojis = () => {
  const [recentEmojis, setRecentEmojis] = useState<Array<string>>([]);

  useEffect(() => {
    const recentEmojis = localStorage.getItem('recentEmojis');
    setRecentEmojis(recentEmojis ? recentEmojis.split(',') : []);
  }, []);

  const add = useCallback((emoji: string) => {
    setRecentEmojis(prevRecentEmojis => {
      const newRecentEmojis = [
        emoji,
        ...prevRecentEmojis.filter(e => e !== emoji),
      ].slice(0, 10);
      localStorage.setItem('recentEmojis', newRecentEmojis.join(','));
      return newRecentEmojis;
    });
  }, []);

  return {
    recentEmojis,
    add,
  };
};

// Memoized individual emoji button to prevent unnecessary re-renders
const EmojiButton = memo(function EmojiButton({
  emoji,
  onSelect,
}: {
  emoji: string;
  onSelect: (emoji: string) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(emoji);
  }, [emoji, onSelect]);

  return (
    <IconButton
      key={emoji}
      size={24}
      style={{ padding: 4 }}
      icon={<span>{emoji}</span>}
      onClick={handleClick}
    />
  );
});

// Memoized emoji groups to prevent unnecessary re-renders
const EmojiGroups = memo(function EmojiGroups({
  onSelect,
  keyword,
  skin,
}: {
  onSelect: (emoji: string) => void;
  keyword?: string;
  skin?: number;
}) {
  const [groups, setGroups] = useState<EmojiGroup[]>([]);

  const loading = !keyword && !groups.length;

  useEffect(() => {
    startTransition(() => {
      if (!keyword) {
        setGroups(emojiGroupList);
        return;
      }

      setGroups(
        emojiGroupList
          .map(group => ({
            ...group,
            emojis: group.emojis.filter(emoji =>
              emoji.tags?.some(tag => tag.includes(keyword.toLowerCase()))
            ),
          }))
          .filter(group => group.emojis.length > 0)
      );
    });
  }, [keyword]);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <Loading size={16} />
        <span style={{ marginLeft: 4 }}>Loading emojis...</span>
      </div>
    );
  }

  return groups.map(group => (
    <div key={group.name} className={pickerStyles.group}>
      <div className={pickerStyles.groupName} data-group-name={group.name}>
        {group.name}
      </div>
      <div className={pickerStyles.groupGrid}>
        {group.emojis.map(emoji => (
          <EmojiButton
            key={emoji.label}
            emoji={
              skin !== undefined && emoji.skins
                ? (emoji.skins[skin]?.unicode ?? emoji.unicode)
                : emoji.unicode
            }
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  ));
});

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
  const scrollableRef = useRef<HTMLDivElement>(null);

  const [keyword, setKeyword] = useState<string>('');
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>(
    undefined
  );
  const [skin, setSkin] = useState<number | undefined>(undefined);
  const { recentEmojis, add: addRecent } = useRecentEmojis();

  const checkActiveGroup = useCallback(() => {
    const scrollable = scrollableRef.current;
    if (!scrollable) return;

    // get actual scrollable element
    const viewport = scrollable.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement;
    if (!viewport) return;

    const scrollTop = viewport.scrollTop;

    // find the first group that is at the top of the scrollable element
    for (let i = emojiGroupList.length - 1; i >= 0; i--) {
      const group = emojiGroupList[i];
      const groupElement = viewport.querySelector(
        `[data-group-name="${group.name}"]`
      ) as HTMLElement;
      if (!groupElement) continue;

      // use offsetTop to get the position of the element relative to the scrollable element
      const elementTop = groupElement.offsetTop;

      if (elementTop <= scrollTop + 50) {
        setActiveGroupId(group.name);
        return;
      }
    }
  }, []);

  const jumpToGroup = useCallback((groupName: string) => {
    const groupElement = scrollableRef.current?.querySelector(
      `[data-group-name="${groupName}"]`
    ) as HTMLElement;
    if (!groupElement) return;

    setActiveGroupId(groupName);
    groupElement.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      addRecent(emoji);
      onSelect?.(emoji);
    },
    [addRecent, onSelect]
  );

  useEffect(() => {
    checkActiveGroup();
  }, [checkActiveGroup]);

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
      <Scrollable.Root className={pickerStyles.scrollRoot} ref={scrollableRef}>
        <Scrollable.Viewport
          onScrollEnd={checkActiveGroup}
          className={pickerStyles.scrollViewport}
        >
          {/* Recent */}
          {recentEmojis.length ? (
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
          ) : null}

          {/* Groups */}
          <EmojiGroups
            onSelect={handleEmojiSelect}
            keyword={keyword}
            skin={skin}
          />
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
      <div className={styles.footer}>
        {['Recent', ...GROUPS].map(group => {
          const Icon = GROUP_ICON_MAP[group as GroupName] ?? RecentIcon;
          const active = activeGroupId === group;
          return (
            <IconButton
              size={18}
              style={{ padding: 3 }}
              key={group}
              icon={
                <Icon
                  className={
                    active ? styles.footerIconActive : styles.footerIcon
                  }
                />
              }
              className={clsx(
                active ? styles.footerButtonActive : styles.footerButton
              )}
              onClick={() => jumpToGroup(group)}
            />
          );
        })}
      </div>
    </div>
  );
};
