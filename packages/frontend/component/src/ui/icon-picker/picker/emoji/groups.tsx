import { RecentIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import {
  createContext,
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IconButton } from '../../../button';
import { Loading } from '../../../loading';
import {
  Masonry,
  type MasonryGroup,
  type MasonryItem,
  type MasonryRef,
} from '../../../masonry';
import * as pickerStyles from '../picker.css';
import { GROUP_ICON_MAP, type GroupName, GROUPS } from './constants';
import rawData from './data/en.json';
import { EmojiButton } from './emoji-button';
import * as styles from './emoji-picker.css';
import type { CompactEmoji, EmojiGroup } from './type';

const emojiGroupList = rawData as EmojiGroup[];

const initEmojiGroupMap = () => {
  const emojiGroupMap = new Map<string, Map<string, CompactEmoji>>();
  emojiGroupList.forEach(group => {
    emojiGroupMap.set(
      group.name,
      new Map(group.emojis.map(emoji => [emoji.label, emoji]))
    );
  });
  return emojiGroupMap;
};
const emojiGroupMap = initEmojiGroupMap();

const EmojiGroupContext = createContext<{
  onSelect: (emoji: string) => void;
  skin?: number;
}>({
  onSelect: () => {},
});

const RecentGroupItem = memo(function RecentGroupItem({
  itemId,
}: {
  itemId: string;
}) {
  const { onSelect } = useContext(EmojiGroupContext);

  return <EmojiButton emoji={itemId} onSelect={onSelect} />;
});
const EmojiGroupItem = memo(function EmojiGroupItem({
  groupId,
  itemId,
}: {
  groupId: string;
  itemId: string;
}) {
  const emoji = emojiGroupMap.get(groupId)?.get(itemId);
  const { onSelect, skin } = useContext(EmojiGroupContext);

  if (!emoji) return null;

  return (
    <EmojiButton
      emoji={
        skin !== undefined && emoji.skins
          ? (emoji.skins[skin]?.unicode ?? emoji.unicode)
          : emoji.unicode
      }
      onSelect={onSelect}
    />
  );
});
const EmojiGroupHeader = memo(function EmojiGroupHeader({
  groupId,
}: {
  groupId: string;
}) {
  return (
    <div className={pickerStyles.groupName} data-group-name={groupId}>
      {groupId}
    </div>
  );
});

// Memoized emoji groups to prevent unnecessary re-renders
export const EmojiGroups = memo(function EmojiGroups({
  recent,
  onSelect,
  keyword,
  skin,
}: {
  onSelect: (emoji: string) => void;
  recent?: string[];
  keyword?: string;
  skin?: number;
}) {
  const masonryRef = useRef<MasonryRef>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>(
    'Recent'
  );
  const [groups, setGroups] = useState<EmojiGroup[]>([]);

  const loading = !keyword && !groups.length;

  useEffect(() => {
    if (!keyword) {
      setGroups(emojiGroupList);
      return;
    }

    startTransition(() => {
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

  const items = useMemo(() => {
    const emojiGroups = groups.map(group => {
      return {
        id: group.name,
        height: 30,
        Component: EmojiGroupHeader,
        items: group.emojis.map(emoji => {
          return {
            id: emoji.label,
            height: 32,
            ratio: 1,
            Component: EmojiGroupItem,
          } satisfies MasonryItem;
        }),
      } satisfies MasonryGroup;
    });
    if (recent?.length) {
      emojiGroups.unshift({
        id: 'Recent',
        height: 30,
        Component: EmojiGroupHeader,
        items: recent.map(emoji => {
          return {
            id: emoji,
            height: 32,
            ratio: 1,
            Component: RecentGroupItem,
          } satisfies MasonryItem;
        }),
      });
    }

    return emojiGroups;
  }, [groups, recent]);
  const contextValue = useMemo(() => ({ onSelect, skin }), [onSelect, skin]);

  const jumpToGroup = useCallback((groupName: string) => {
    setActiveGroupId(groupName);
    masonryRef.current?.scrollToGroup(groupName);
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <Loading size={16} />
        <span style={{ marginLeft: 4 }}>Loading emojis...</span>
      </div>
    );
  }

  return (
    <EmojiGroupContext.Provider value={contextValue}>
      <div className={pickerStyles.emojiScrollRoot}>
        <Masonry
          ref={masonryRef}
          virtualScroll
          items={items}
          itemWidthMin={32}
          itemWidth={32}
          paddingX={12}
          paddingY={8}
          gapX={4}
          gapY={4}
          onStickyGroupChange={setActiveGroupId}
        />
      </div>
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
    </EmojiGroupContext.Provider>
  );
});
