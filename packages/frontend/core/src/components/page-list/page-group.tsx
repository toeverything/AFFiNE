import { useBlockSuiteWorkspacePageTitle } from '@affine/core/hooks/use-block-suite-workspace-page-title';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import type { Tag } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  EdgelessIcon,
  PageIcon,
  TodayIcon,
  ToggleCollapseIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import clsx from 'clsx';
import { selectAtom } from 'jotai/utils';
import { type MouseEventHandler, useCallback, useMemo, useState } from 'react';

import { PagePreview } from './page-content-preview';
import * as styles from './page-group.css';
import { PageListItem } from './page-list-item';
import {
  pageGroupCollapseStateAtom,
  pageListPropsAtom,
  selectionStateAtom,
  useAtom,
  useAtomValue,
} from './scoped-atoms';
import type { PageGroupProps, PageListItemProps, PageListProps } from './types';
import { shallowEqual } from './utils';

export const PageGroupHeader = ({ id, items, label }: PageGroupProps) => {
  const [collapseState, setCollapseState] = useAtom(pageGroupCollapseStateAtom);
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
    const selectedPageIds = selectionState.selectedPageIds ?? [];
    return items.filter(item => selectedPageIds.includes(item.id));
  }, [items, selectionState.selectedPageIds]);

  const allSelected = selectedItems.length === items.length;

  const onSelectAll = useCallback(() => {
    // also enable selection active
    setSelectionActive(true);

    const nonCurrentGroupIds =
      selectionState.selectedPageIds?.filter(
        id => !items.map(item => item.id).includes(id)
      ) ?? [];

    const newSelectedPageIds = allSelected
      ? nonCurrentGroupIds
      : [...nonCurrentGroupIds, ...items.map(item => item.id)];

    selectionState.onSelectedPageIdsChange?.(newSelectedPageIds);
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

export const PageGroup = ({ id, items, label }: PageGroupProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const onExpandedClicked: MouseEventHandler = useCallback(e => {
    e.stopPropagation();
    e.preventDefault();
    setCollapsed(v => !v);
  }, []);
  const selectionState = useAtomValue(selectionStateAtom);
  const selectedItems = useMemo(() => {
    const selectedPageIds = selectionState.selectedPageIds ?? [];
    return items.filter(item => selectedPageIds.includes(item.id));
  }, [items, selectionState.selectedPageIds]);
  const onSelectAll = useCallback(() => {
    const nonCurrentGroupIds =
      selectionState.selectedPageIds?.filter(
        id => !items.map(item => item.id).includes(id)
      ) ?? [];

    selectionState.onSelectedPageIdsChange?.([
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
            <PageMetaListItemRenderer key={item.id} {...item} />
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
  'pageOperationsRenderer',
  'selectedPageIds',
  'onSelectedPageIdsChange',
  'draggable',
] as const;

type RequiredProps = Pick<PageListProps, (typeof requiredPropNames)[number]> & {
  selectable: boolean;
};

const listPropsAtom = selectAtom(
  pageListPropsAtom,
  props => {
    return Object.fromEntries(
      requiredPropNames.map(name => [name, props[name]])
    ) as RequiredProps;
  },
  shallowEqual
);

export const PageMetaListItemRenderer = (pageMeta: PageMeta) => {
  const props = useAtomValue(listPropsAtom);
  const { selectionActive } = useAtomValue(selectionStateAtom);
  return (
    <PageListItem
      {...pageMetaToPageItemProp(pageMeta, {
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

const PageTitle = ({ id, workspace }: { id: string; workspace: Workspace }) => {
  const title = useBlockSuiteWorkspacePageTitle(workspace, id);
  return title;
};

const UnifiedPageIcon = ({
  id,
  workspace,
  isPreferredEdgeless,
}: {
  id: string;
  workspace: Workspace;
  isPreferredEdgeless: (id: string) => boolean;
}) => {
  const isEdgeless = isPreferredEdgeless(id);
  const { isJournal } = useJournalInfoHelper(workspace, id);
  if (isJournal) {
    return <TodayIcon />;
  }
  return isEdgeless ? <EdgelessIcon /> : <PageIcon />;
};

function pageMetaToPageItemProp(
  pageMeta: PageMeta,
  props: RequiredProps
): PageListItemProps {
  const toggleSelection = props.onSelectedPageIdsChange
    ? () => {
        assertExists(props.selectedPageIds);
        const prevSelected = props.selectedPageIds.includes(pageMeta.id);
        const shouldAdd = !prevSelected;
        const shouldRemove = prevSelected;

        if (shouldAdd) {
          props.onSelectedPageIdsChange?.([
            ...props.selectedPageIds,
            pageMeta.id,
          ]);
        } else if (shouldRemove) {
          props.onSelectedPageIdsChange?.(
            props.selectedPageIds.filter(id => id !== pageMeta.id)
          );
        }
      }
    : undefined;
  const itemProps: PageListItemProps = {
    pageId: pageMeta.id,
    title: <PageTitle id={pageMeta.id} workspace={props.blockSuiteWorkspace} />,
    preview: (
      <PagePreview workspace={props.blockSuiteWorkspace} pageId={pageMeta.id} />
    ),
    createDate: new Date(pageMeta.createDate),
    updatedDate: pageMeta.updatedDate
      ? new Date(pageMeta.updatedDate)
      : undefined,
    to:
      props.rowAsLink && !props.selectable
        ? `/workspace/${props.blockSuiteWorkspace.id}/${pageMeta.id}`
        : undefined,
    onClick: props.selectable ? toggleSelection : undefined,
    icon: (
      <UnifiedPageIcon
        id={pageMeta.id}
        workspace={props.blockSuiteWorkspace}
        isPreferredEdgeless={props.isPreferredEdgeless}
      />
    ),
    tags:
      pageMeta.tags
        ?.map(id => tagIdToTagOption(id, props.blockSuiteWorkspace))
        .filter((v): v is Tag => v != null) ?? [],
    operations: props.pageOperationsRenderer?.(pageMeta),
    selectable: props.selectable,
    selected: props.selectedPageIds?.includes(pageMeta.id),
    onSelectedChange: toggleSelection,
    draggable: props.draggable,
    isPublicPage: !!pageMeta.isPublic,
  };
  return itemProps;
}
