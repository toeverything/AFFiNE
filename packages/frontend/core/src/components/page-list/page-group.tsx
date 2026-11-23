import { shallowEqual } from '@affine/component';
import type { CollectionMeta } from '@affine/core/modules/collection';
import { useI18n } from '@affine/i18n';
import { ToggleRightIcon, ViewLayersIcon } from '@blocksuite/icons/rc';
import { selectAtom } from 'jotai/utils';
import type { MouseEventHandler } from 'react';
import { memo, useCallback, useMemo } from 'react';

import { CollectionListItem } from './collections/collection-list-item';
import * as styles from './page-group.css';
import {
  groupCollapseStateAtom,
  listPropsAtom,
  selectionStateAtom,
  useAtom,
  useAtomValue,
} from './scoped-atoms';
import { TagListItem } from './tags/tag-list-item';
import type {
  CollectionListItemProps,
  ItemGroupProps,
  ListItem,
  ListProps,
  TagListItemProps,
  TagMeta,
} from './types';

export const ItemGroupHeader = memo(function ItemGroupHeader<
  T extends ListItem,
>({ id, items, label }: ItemGroupProps<T>) {
  const [collapseState, setCollapseState] = useAtom(groupCollapseStateAtom);
  const collapsed = collapseState[id];
  const onExpandedClicked: MouseEventHandler = useCallback(
    e => {
      e.stopPropagation();
      e.preventDefault();
      setCollapseState(v => ({ ...v, [id]: !v[id] }));
    },
    [id, setCollapseState]
  );

  const [selectionState, setSelectionActive] = useAtom(selectionStateAtom);
  const selectedItems = useMemo(() => {
    const selectedIds = selectionState.selectedIds ?? [];
    return items.filter(item => selectedIds.includes(item.id));
  }, [items, selectionState.selectedIds]);

  const allSelected = selectedItems.length === items.length;

  const onSelectAll = useCallback(() => {
    // also enable selection active
    setSelectionActive(true);

    const nonCurrentGroupIds =
      selectionState.selectedIds?.filter(
        id => !items.map(item => item.id).includes(id)
      ) ?? [];

    const newSelectedPageIds = allSelected
      ? nonCurrentGroupIds
      : [...nonCurrentGroupIds, ...items.map(item => item.id)];

    selectionState.onSelectedIdsChange?.(newSelectedPageIds);
  }, [setSelectionActive, selectionState, allSelected, items]);

  const t = useI18n();

  return label ? (
    <div
      data-testid="page-list-group-header"
      className={styles.header}
      data-group-id={id}
      data-group-items-count={items.length}
      data-group-selected-items-count={selectedItems.length}
    >
      <div
        role="button"
        onClick={onExpandedClicked}
        data-testid="page-list-group-header-collapsed-button"
        className={styles.collapsedIconContainer}
      >
        <ToggleRightIcon
          className={styles.collapsedIcon}
          data-collapsed={!!collapsed}
        />
      </div>
      <div className={styles.headerLabel}>{label}</div>
      {selectionState.selectionActive ? (
        <div className={styles.headerCount}>
          {selectedItems.length}/{items.length}
        </div>
      ) : null}
      <div className={styles.spacer} />
      <button className={styles.selectAllButton} onClick={onSelectAll}>
        {t[
          allSelected
            ? 'com.affine.page.group-header.clear'
            : 'com.affine.page.group-header.select-all'
        ]()}
      </button>
    </div>
  ) : null;
});

// TODO(@Peng): optimize how to render page meta list item
const requiredPropNames = [
  'docCollection',
  'rowAsLink',
  'operationsRenderer',
  'selectedIds',
  'onSelectedIdsChange',
  'draggable',
] as const;

type RequiredProps<T> = Pick<
  ListProps<T>,
  (typeof requiredPropNames)[number]
> & {
  selectable: boolean;
};

const listsPropsAtom = selectAtom(
  listPropsAtom,
  props => {
    return Object.fromEntries(
      requiredPropNames.map(name => [name, props?.[name]])
    ) as RequiredProps<ListItem>;
  },
  shallowEqual
);

export const CollectionListItemRenderer = memo((item: ListItem) => {
  const props = useAtomValue(listsPropsAtom);
  const { selectionActive } = useAtomValue(selectionStateAtom);
  const collection = item as CollectionMeta;
  return (
    <CollectionListItem
      {...collectionMetaToListItemProp(collection, {
        ...props,
        selectable: !!selectionActive,
      })}
    />
  );
});

CollectionListItemRenderer.displayName = 'CollectionListItemRenderer';

export const TagListItemRenderer = memo(function TagListItemRenderer(
  item: ListItem
) {
  const props = useAtomValue(listsPropsAtom);
  const { selectionActive } = useAtomValue(selectionStateAtom);
  const tag = item as TagMeta;
  return (
    <TagListItem
      {...tagMetaToListItemProp(tag, {
        ...props,
        selectable: !!selectionActive,
      })}
    />
  );
});

function collectionMetaToListItemProp(
  item: CollectionMeta,
  props: RequiredProps<CollectionMeta>
): CollectionListItemProps {
  const toggleSelection = props.onSelectedIdsChange
    ? () => {
        if (!props.selectedIds) {
          throw new Error('selectedIds is not found');
        }
        const prevSelected = props.selectedIds.includes(item.id);
        const shouldAdd = !prevSelected;
        const shouldRemove = prevSelected;

        if (shouldAdd) {
          props.onSelectedIdsChange?.([...props.selectedIds, item.id]);
        } else if (shouldRemove) {
          props.onSelectedIdsChange?.(
            props.selectedIds.filter(id => id !== item.id)
          );
        }
      }
    : undefined;
  const itemProps: CollectionListItemProps = {
    collectionId: item.id,
    title: item.title,
    to:
      props.rowAsLink && !props.selectable
        ? `/collection/${item.id}`
        : undefined,
    onClick: toggleSelection,
    icon: <ViewLayersIcon />,
    operations: props.operationsRenderer?.(item),
    selectable: props.selectable,
    selected: props.selectedIds?.includes(item.id),
    onSelectedChange: toggleSelection,
    draggable: props.draggable,
  };
  return itemProps;
}
function tagMetaToListItemProp(
  item: TagMeta,
  props: RequiredProps<TagMeta>
): TagListItemProps {
  const toggleSelection = props.onSelectedIdsChange
    ? () => {
        if (!props.selectedIds) {
          throw new Error('selectedIds is not found');
        }
        const prevSelected = props.selectedIds.includes(item.id);
        const shouldAdd = !prevSelected;
        const shouldRemove = prevSelected;

        if (shouldAdd) {
          props.onSelectedIdsChange?.([...props.selectedIds, item.id]);
        } else if (shouldRemove) {
          props.onSelectedIdsChange?.(
            props.selectedIds.filter(id => id !== item.id)
          );
        }
      }
    : undefined;
  const itemProps: TagListItemProps = {
    tagId: item.id,
    title: item.name,
    to: props.rowAsLink && !props.selectable ? `/tag/${item.id}` : undefined,
    onClick: toggleSelection,
    color: item.color,
    operations: props.operationsRenderer?.(item),
    selectable: props.selectable,
    selected: props.selectedIds?.includes(item.id),
    onSelectedChange: toggleSelection,
    draggable: props.draggable,
  };
  return itemProps;
}
