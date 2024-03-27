import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons';
import type { DocMeta } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { type ReactNode, useMemo } from 'react';

import * as styles from './group-definitions.css';
import type {
  DateKey,
  ItemGroupDefinition,
  ListItem,
  PageGroupByType,
} from './types';
import { betweenDaysAgo, withinDaysAgo } from './utils';

export const pageGroupByTypeAtom = atomWithStorage<PageGroupByType>(
  'pageGroupByType',
  'updatedDate'
);

const GroupLabel = ({
  label,
  count,
  icon,
  id,
}: {
  id: string;
  label: ReactNode;
  count: number;
  icon?: ReactNode;
}) => (
  <div className={styles.groupLabelWrapper}>
    {icon}
    <div
      className={styles.groupLabel}
      data-testid={`group-label-${id}-${count}`}
    >
      {label}
    </div>
    <div className={styles.pageCount}>{` · ${count}`}</div>
  </div>
);

// todo: optimize date matchers
export const useDateGroupDefinitions = <T extends ListItem>(
  key: DateKey
): ItemGroupDefinition<T>[] => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => [
      {
        id: 'today',
        label: count => (
          <GroupLabel
            id="today"
            label={t['com.affine.today']()}
            count={count}
          />
        ),
        match: item =>
          withinDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 1),
      },
      {
        id: 'yesterday',
        label: count => (
          <GroupLabel
            id="yesterday"
            label={t['com.affine.yesterday']()}
            count={count}
          />
        ),
        match: item =>
          betweenDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 1, 2),
      },
      {
        id: 'last7Days',
        label: count => (
          <GroupLabel
            id="last7Days"
            label={t['com.affine.last7Days']()}
            count={count}
          />
        ),
        match: item =>
          betweenDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 2, 7),
      },
      {
        id: 'last30Days',
        label: count => (
          <GroupLabel
            id="last30Days"
            label={t['com.affine.last30Days']()}
            count={count}
          />
        ),
        match: item =>
          betweenDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 7, 30),
      },
      {
        id: 'moreThan30Days',
        label: count => (
          <GroupLabel
            id="moreThan30Days"
            label={t['com.affine.moreThan30Days']()}
            count={count}
          />
        ),
        match: item =>
          !withinDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 30),
      },
    ],
    [key, t]
  );
};

const GroupTagLabel = ({ tag, count }: { tag: Tag; count: number }) => {
  const tagValue = useLiveData(tag.value$);
  const tagColor = useLiveData(tag.color$);
  return (
    <GroupLabel
      id={tag.id}
      label={tagValue}
      count={count}
      icon={
        <div
          className={styles.tagIcon}
          style={{
            backgroundColor: tagColor,
          }}
        ></div>
      }
    ></GroupLabel>
  );
};
export const useTagGroupDefinitions = (): ItemGroupDefinition<ListItem>[] => {
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tags$);
  return useMemo(() => {
    return tags.map(tag => ({
      id: tag.id,
      label: count => {
        return <GroupTagLabel tag={tag} count={count} />;
      },
      match: item => (item as DocMeta).tags?.includes(tag.id),
    }));
  }, [tags]);
};

export const useFavoriteGroupDefinitions = <
  T extends ListItem,
>(): ItemGroupDefinition<T>[] => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => [
      {
        id: 'favourited',
        label: count => (
          <GroupLabel
            id="favourited"
            label={t['com.affine.page.group-header.favourited']()}
            count={count}
            icon={<FavoritedIcon className={styles.favouritedIcon} />}
          />
        ),
        match: item => !!(item as DocMeta).favorite,
      },
      {
        id: 'notFavourited',
        label: count => (
          <GroupLabel
            id="notFavourited"
            label={t['com.affine.page.group-header.not-favourited']()}
            count={count}
            icon={<FavoriteIcon className={styles.notFavouritedIcon} />}
          />
        ),
        match: item => !(item as DocMeta).favorite,
      },
    ],
    [t]
  );
};

export const usePageItemGroupDefinitions = () => {
  const key = useAtomValue(pageGroupByTypeAtom);
  const tagGroupDefinitions = useTagGroupDefinitions();
  const createDateGroupDefinitions = useDateGroupDefinitions('createDate');
  const updatedDateGroupDefinitions = useDateGroupDefinitions('updatedDate');
  const favouriteGroupDefinitions = useFavoriteGroupDefinitions();

  return useMemo(() => {
    const itemGroupDefinitions = {
      createDate: createDateGroupDefinitions,
      updatedDate: updatedDateGroupDefinitions,
      tag: tagGroupDefinitions,
      favourites: favouriteGroupDefinitions,
      none: undefined,

      // add more here later
      // todo: some page group definitions maybe dynamic
    };
    return itemGroupDefinitions[key];
  }, [
    createDateGroupDefinitions,
    favouriteGroupDefinitions,
    key,
    tagGroupDefinitions,
    updatedDateGroupDefinitions,
  ]);
};
