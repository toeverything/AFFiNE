import type { Tag } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { EdgelessIcon, PageIcon, ToggleCollapseIcon } from '@blocksuite/icons';
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
import type {
  PageGroupDefinition,
  PageGroupProps,
  PageListItemProps,
  PageListProps,
} from './types';
import { type DateKey } from './types';
import { betweenDaysAgo, shallowEqual, withinDaysAgo } from './utils';

// todo: optimize date matchers
const getDateGroupDefinitions = (key: DateKey): PageGroupDefinition[] => [
  {
    id: 'today',
    label: <Trans i18nKey="com.affine.today" />,
    match: item => withinDaysAgo(new Date(item[key] ?? item.createDate), 1),
  },
  {
    id: 'yesterday',
    label: <Trans i18nKey="com.affine.yesterday" />,
    match: item => betweenDaysAgo(new Date(item[key] ?? item.createDate), 1, 2),
  },
  {
    id: 'last7Days',
    label: <Trans i18nKey="com.affine.last7Days" />,
    match: item => betweenDaysAgo(new Date(item[key] ?? item.createDate), 2, 7),
  },
  {
    id: 'last30Days',
    label: <Trans i18nKey="com.affine.last30Days" />,
    match: item =>
      betweenDaysAgo(new Date(item[key] ?? item.createDate), 7, 30),
  },
  {
    id: 'moreThan30Days',
    label: <Trans i18nKey="com.affine.moreThan30Days" />,
    match: item => !withinDaysAgo(new Date(item[key] ?? item.createDate), 30),
  },
];

const pageGroupDefinitions = {
  createDate: getDateGroupDefinitions('createDate'),
  updatedDate: getDateGroupDefinitions('updatedDate'),
  // add more here later
  // todo: some page group definitions maybe dynamic
};

export function pagesToPageGroups(
  pages: PageMeta[],
  key?: DateKey
): PageGroupProps[] {
  if (!key) {
    return [
      {
        id: 'all',
        items: pages,
        allItems: pages,
      },
    ];
  }

  // assume pages are already sorted, we will use the page order to determine the group order
  const groupDefs = pageGroupDefinitions[key];
  const groups: PageGroupProps[] = [];

  for (const page of pages) {
    // for a single page, there could be multiple groups that it belongs to
    const matchedGroups = groupDefs.filter(def => def.match(page));
    for (const groupDef of matchedGroups) {
      const group = groups.find(g => g.id === groupDef.id);
      if (group) {
        group.items.push(page);
      } else {
        const label =
          typeof groupDef.label === 'function'
            ? groupDef.label()
            : groupDef.label;
        groups.push({
          id: groupDef.id,
          label: label,
          items: [page],
          allItems: pages,
        });
      }
    }
  }
  return groups;
}

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
    title: pageMeta.title,
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
    icon: props.isPreferredEdgeless?.(pageMeta.id) ? (
      <EdgelessIcon />
    ) : (
      <PageIcon />
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
