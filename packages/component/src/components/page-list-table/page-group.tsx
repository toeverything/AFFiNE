import { Trans } from '@affine/i18n';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { type MouseEventHandler, useCallback, useState } from 'react';

import {
  type DateKey,
  isLastMonth,
  isLastWeek,
  isLastYear,
  isToday,
  isYesterday,
} from '../page-list';
import { PageListItem } from '.';
import * as styles from './page-group.css';
import type {
  PageGroupDefinition,
  PageGroupProps,
  PageListItemProps,
} from './types';

const getDateGroupDefinitions = (key: DateKey): PageGroupDefinition[] => [
  {
    id: 'today',
    label: <Trans i18nKey="com.affine.today" />,
    match: item => isToday(item[key]),
  },
  {
    id: 'yesterday',
    label: <Trans i18nKey="com.affine.yesterday" />,
    match: item => isYesterday(item[key]) && !isToday(item[key]),
  },
  {
    id: 'last7Days',
    label: <Trans i18nKey="com.affine.last7Days" />,
    match: item => isLastWeek(item[key]) && !isYesterday(item[key]),
  },
  {
    id: 'last30Days',
    label: <Trans i18nKey="com.affine.last30Days" />,
    match: item => isLastMonth(item[key]) && !isLastWeek(item[key]),
  },
  {
    id: 'currentYear',
    label: <Trans i18nKey="com.affine.currentYear" />,
    match: item => isLastYear(item[key]) && !isLastMonth(item[key]),
  },
];

const pageGroupDefinitions = {
  createDate: getDateGroupDefinitions('createDate'),
  updatedDate: getDateGroupDefinitions('updatedDate'),
  // add more here later
};

export function pagesToPageGroups(
  pages: PageListItemProps[],
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

  return groupDefs.map(groupDef => {
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
  });
}

export const PageGroup = (props: PageGroupProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const onExpandedClicked: MouseEventHandler = useCallback(e => {
    e.stopPropagation();
    e.preventDefault();
    setCollapsed(v => !v);
  }, []);
  return (
    <div data-testid="page-list-group" className={styles.root}>
      {props.label ? (
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
          <div>
            <div className={styles.headerLabel}>{props.label}</div>
            <div className={styles.headerCount}>{props.items.length}</div>
          </div>
        </div>
      ) : null}
      {collapsed
        ? null
        : props.items.map(item => <PageListItem key={item.pageId} {...item} />)}
    </div>
  );
};
