import type { Tag } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { assertExists } from '@blocksuite/global/utils';
import { ArrowDownSmallIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { isEqual } from 'lodash-es';
import { type MouseEventHandler, useCallback, useState } from 'react';

import {
  type DateKey,
  isLastMonth,
  isLastWeek,
  isLastYear,
  isToday,
  isYesterday,
} from '../page-list';
import { PagePreview } from './page-content-preview';
import * as styles from './page-group.css';
import { PageListItem } from './page-list-item';
import { pageListPropsAtom } from './scoped-atoms';
import type {
  PageGroupDefinition,
  PageGroupProps,
  PageListItemProps,
  PageListProps,
} from './types';

// todo: optimize date matchers
const getDateGroupDefinitions = (key: DateKey): PageGroupDefinition[] => [
  {
    id: 'today',
    label: <Trans i18nKey="com.affine.today" />,
    match: item => isToday(new Date(item[key] ?? item.createDate)),
  },
  {
    id: 'yesterday',
    label: <Trans i18nKey="com.affine.yesterday" />,
    match: item =>
      isYesterday(new Date(item[key] ?? item.createDate)) &&
      !isToday(new Date(item[key] ?? item.createDate)),
  },
  {
    id: 'last7Days',
    label: <Trans i18nKey="com.affine.last7Days" />,
    match: item =>
      isLastWeek(new Date(item[key] ?? item.createDate)) &&
      !isYesterday(new Date(item[key] ?? item.createDate)),
  },
  {
    id: 'last30Days',
    label: <Trans i18nKey="com.affine.last30Days" />,
    match: item =>
      isLastMonth(new Date(item[key] ?? item.createDate)) &&
      !isLastWeek(new Date(item[key] ?? item.createDate)),
  },
  {
    id: 'currentYear',
    label: <Trans i18nKey="com.affine.currentYear" />,
    match: item =>
      isLastYear(new Date(item[key] ?? item.createDate)) &&
      !isLastMonth(new Date(item[key] ?? item.createDate)),
  },
];

const pageGroupDefinitions = {
  createDate: getDateGroupDefinitions('createDate'),
  updatedDate: getDateGroupDefinitions('updatedDate'),
  // add more here later
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

  const groupDefs = pageGroupDefinitions[key];

  return groupDefs
    .map(groupDef => {
      const filtered = pages.filter(page => groupDef.match(page));
      const label =
        typeof groupDef.label === 'function'
          ? groupDef.label(filtered, pages)
          : groupDef.label;
      return {
        id: groupDef.id,
        label,
        items: filtered,
        allItems: pages,
      };
    })
    .filter(group => group.items.length > 0);
}

export const PageGroup = ({ id, items, label }: PageGroupProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const onExpandedClicked: MouseEventHandler = useCallback(e => {
    e.stopPropagation();
    e.preventDefault();
    setCollapsed(v => !v);
  }, []);
  return (
    <div
      data-testid="page-list-group"
      data-group-id={id}
      className={styles.root}
    >
      {label ? (
        <div data-testid="page-list-group-header" className={styles.header}>
          <div
            role="button"
            onClick={onExpandedClicked}
            data-testid="page-list-group-header-collapsed-button"
            className={styles.collapsedIconContainer}
          >
            <ArrowDownSmallIcon
              className={styles.collapsedIcon}
              data-collapsed={collapsed !== false}
            />
          </div>
          <div className={styles.headerLabel}>{label}</div>
          <div className={styles.headerCount}>{items.length}</div>
        </div>
      ) : null}
      {collapsed
        ? null
        : items.map(item => (
            <PageMetaListItemRenderer key={item.id} {...item} />
          ))}
    </div>
  );
};

// todo: optimize how to render page meta list item
const requiredPropNames = [
  'blockSuiteWorkspace',
  'renderPageAsLink',
  'onOpenPage',
  'onToggleFavorite',
  'isPreferredEdgeless',
  'pageOperationsRenderer',
  'selectable',
  'selectedPageIds',
  'onSelectedPageIdsChange',
  'draggable',
  'onDragStart',
  'onDragEnd',
] as const;

type RequiredProps = Pick<PageListProps, (typeof requiredPropNames)[number]>;

const listPropsAtom = selectAtom(
  pageListPropsAtom,
  props => {
    return Object.fromEntries(
      requiredPropNames.map(name => [name, props[name]])
    ) as RequiredProps;
  },
  isEqual
);

const PageMetaListItemRenderer = (pageMeta: PageMeta) => {
  const props = useAtomValue(listPropsAtom);
  return <PageListItem {...pageMetaToPageItemProp(pageMeta, props)} />;
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
  const itemProps: PageListItemProps = {
    pageId: pageMeta.id,
    title: pageMeta.title,
    preview: (
      <PagePreview workspace={props.blockSuiteWorkspace} pageId={pageMeta.id} />
    ),
    createDate: new Date(pageMeta.createDate),
    updatedDate: new Date(pageMeta.updatedDate ?? pageMeta.createDate),
    to: props.renderPageAsLink
      ? `/workspace/${props.blockSuiteWorkspace.id}/page/${pageMeta.id}`
      : undefined,
    onClickPage: props.onOpenPage
      ? newTab => {
          props.onOpenPage?.(pageMeta.id, newTab);
        }
      : undefined,
    favorite: !!pageMeta.favorite,
    onToggleFavorite() {
      props.onToggleFavorite?.(pageMeta.id);
    },
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
    onSelectedChange: props.onSelectedPageIdsChange
      ? selected => {
          assertExists(props.selectedPageIds);
          const prevSelected = props.selectedPageIds.includes(pageMeta.id);
          const shouldAdd = selected && !prevSelected;
          const shouldRemove = !selected && prevSelected;

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
      : undefined,
    draggable: props.draggable,
    isPublicPage: !!pageMeta.isPublic,
    onDragStart: props.onDragStart
      ? () => props.onDragStart?.(pageMeta.id)
      : undefined,
    onDragEnd: props.onDragEnd
      ? () => props.onDragEnd?.(pageMeta.id)
      : undefined,
  };
  return itemProps;
}
