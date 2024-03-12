import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import type { Tag } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  EdgelessIcon,
  PageIcon,
  TodayIcon,
  ToggleCollapseIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type { DocMeta, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { PageRecordList } from '@toeverything/infra';
import clsx from 'clsx';
import { selectAtom } from 'jotai/utils';
import { type MouseEventHandler, useCallback, useMemo, useState } from 'react';

import { CollectionListItem } from './collections/collection-list-item';
import { PageListItem } from './docs/page-list-item';
import { PagePreview } from './page-content-preview';
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
  CollectionMeta,
  ItemGroupProps,
  ListItem,
  ListProps,
  PageListItemProps,
  TagListItemProps,
  TagMeta,
} from './types';
import { shallowEqual } from './utils';

export const ItemGroupHeader = <T extends ListItem>({
  id,
  items,
  label,
}: ItemGroupProps<T>) => {
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

  const t = useAFFiNEI18N();

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
        <ToggleCollapseIcon
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
};

export const ItemGroup = <T extends ListItem>({
  id,
  items,
  label,
}: ItemGroupProps<T>) => {
  const [collapsed, setCollapsed] = useState(false);
  const onExpandedClicked: MouseEventHandler = useCallback(e => {
    e.stopPropagation();
    e.preventDefault();
    setCollapsed(v => !v);
  }, []);
  const selectionState = useAtomValue(selectionStateAtom);
  const selectedItems = useMemo(() => {
    const selectedIds = selectionState.selectedIds ?? [];
    return items.filter(item => selectedIds.includes(item.id));
  }, [items, selectionState.selectedIds]);
  const onSelectAll = useCallback(() => {
    const nonCurrentGroupIds =
      selectionState.selectedIds?.filter(
        id => !items.map(item => item.id).includes(id)
      ) ?? [];

    selectionState.onSelectedIdsChange?.([
      ...nonCurrentGroupIds,
      ...items.map(item => item.id),
    ]);
  }, [items, selectionState]);
  const t = useAFFiNEI18N();
  return (
    <Collapsible.Root
      data-testid="page-list-group"
      data-group-id={id}
      open={!collapsed}
      className={clsx(styles.root)}
    >
      {label ? (
        <div data-testid="page-list-group-header" className={styles.header}>
          <Collapsible.Trigger
            role="button"
            onClick={onExpandedClicked}
            data-testid="page-list-group-header-collapsed-button"
            className={styles.collapsedIconContainer}
          >
            <ToggleCollapseIcon
              className={styles.collapsedIcon}
              data-collapsed={collapsed !== false}
            />
          </Collapsible.Trigger>
          <div className={styles.headerLabel}>{label}</div>
          {selectionState.selectionActive ? (
            <div className={styles.headerCount}>
              {selectedItems.length}/{items.length}
            </div>
          ) : null}
          <div className={styles.spacer} />
          {selectionState.selectionActive ? (
            <button className={styles.selectAllButton} onClick={onSelectAll}>
              {t['com.affine.page.group-header.select-all']()}
            </button>
          ) : null}
        </div>
      ) : null}
      <Collapsible.Content className={styles.collapsibleContent}>
        <div className={styles.collapsibleContentInner}>
          {items.map(item => (
            <PageListItemRenderer key={item.id} {...item} />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

// todo: optimize how to render page meta list item
const requiredPropNames = [
  'blockSuiteWorkspace',
  'rowAsLink',
  'isPreferredEdgeless',
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
      requiredPropNames.map(name => [name, props[name]])
    ) as RequiredProps<ListItem>;
  },
  shallowEqual
);

export const PageListItemRenderer = (item: ListItem) => {
  const props = useAtomValue(listsPropsAtom);
  const { selectionActive } = useAtomValue(selectionStateAtom);
  const page = item as DocMeta;
  return (
    <PageListItem
      {...pageMetaToListItemProp(page, {
        ...props,
        selectable: !!selectionActive,
      })}
    />
  );
};

export const CollectionListItemRenderer = (item: ListItem) => {
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
};

export const TagListItemRenderer = (item: ListItem) => {
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
};

function tagIdToTagOption(
  tagId: string,
  blockSuiteWorkspace: Workspace
): Tag | undefined {
  return blockSuiteWorkspace.meta.properties.tags?.options.find(
    opt => opt.id === tagId
  );
}

const PageTitle = ({ id }: { id: string }) => {
  const page = useLiveData(
    useService(PageRecordList).records.map(record => {
      return record.find(p => p.id === id);
    })
  );
  const title = useLiveData(page?.title);
  const t = useAFFiNEI18N();
  return title || t['Untitled']();
};

const UnifiedPageIcon = ({
  id,
  workspace,
  isPreferredEdgeless,
}: {
  id: string;
  workspace: Workspace;
  isPreferredEdgeless?: (id: string) => boolean;
}) => {
  const isEdgeless = isPreferredEdgeless ? isPreferredEdgeless(id) : false;
  const { isJournal } = useJournalInfoHelper(workspace, id);
  if (isJournal) {
    return <TodayIcon />;
  }
  return isEdgeless ? <EdgelessIcon /> : <PageIcon />;
};

function pageMetaToListItemProp(
  item: DocMeta,
  props: RequiredProps<DocMeta>
): PageListItemProps {
  const toggleSelection = props.onSelectedIdsChange
    ? () => {
        assertExists(props.selectedIds);
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
  const itemProps: PageListItemProps = {
    pageId: item.id,
    title: <PageTitle id={item.id} />,
    preview: (
      <PagePreview workspace={props.blockSuiteWorkspace} pageId={item.id} />
    ),
    createDate: new Date(item.createDate),
    updatedDate: item.updatedDate ? new Date(item.updatedDate) : undefined,
    to: props.rowAsLink && !props.selectable ? `/${item.id}` : undefined,
    onClick: props.selectable ? toggleSelection : undefined,
    icon: (
      <UnifiedPageIcon
        id={item.id}
        workspace={props.blockSuiteWorkspace}
        isPreferredEdgeless={props.isPreferredEdgeless}
      />
    ),
    tags:
      item.tags
        ?.map(id => tagIdToTagOption(id, props.blockSuiteWorkspace))
        .filter((v): v is Tag => v != null) ?? [],
    operations: props.operationsRenderer?.(item),
    selectable: props.selectable,
    selected: props.selectedIds?.includes(item.id),
    onSelectedChange: toggleSelection,
    draggable: props.draggable,
    isPublicPage: !!item.isPublic,
  };
  return itemProps;
}

function collectionMetaToListItemProp(
  item: CollectionMeta,
  props: RequiredProps<CollectionMeta>
): CollectionListItemProps {
  const toggleSelection = props.onSelectedIdsChange
    ? () => {
        assertExists(props.selectedIds);
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
    onClick: props.selectable ? toggleSelection : undefined,
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
        assertExists(props.selectedIds);
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
    title: item.title,
    to: props.rowAsLink && !props.selectable ? `/tag/${item.id}` : undefined,
    onClick: props.selectable ? toggleSelection : undefined,
    color: item.color,
    pageCount: item.pageCount,
    operations: props.operationsRenderer?.(item),
    selectable: props.selectable,
    selected: props.selectedIds?.includes(item.id),
    onSelectedChange: toggleSelection,
    draggable: props.draggable,
  };
  return itemProps;
}
