import { Trans } from '@affine/i18n';

import type { ItemGroupDefinition, ItemGroupProps, ListItem } from './types';
import { type DateKey } from './types';
import { betweenDaysAgo, withinDaysAgo } from './utils';

// todo: optimize date matchers
const getDateGroupDefinitions = <T extends ListItem>(
  key: DateKey
): ItemGroupDefinition<T>[] => [
  {
    id: 'today',
    label: <Trans i18nKey="com.affine.today" />,
    match: item =>
      withinDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 1),
  },
  {
    id: 'yesterday',
    label: <Trans i18nKey="com.affine.yesterday" />,
    match: item =>
      betweenDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 1, 2),
  },
  {
    id: 'last7Days',
    label: <Trans i18nKey="com.affine.last7Days" />,
    match: item =>
      betweenDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 2, 7),
  },
  {
    id: 'last30Days',
    label: <Trans i18nKey="com.affine.last30Days" />,
    match: item =>
      betweenDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 7, 30),
  },
  {
    id: 'moreThan30Days',
    label: <Trans i18nKey="com.affine.moreThan30Days" />,
    match: item =>
      !withinDaysAgo(new Date(item[key] ?? item.createDate ?? ''), 30),
  },
];

const itemGroupDefinitions = {
  createDate: getDateGroupDefinitions('createDate'),
  updatedDate: getDateGroupDefinitions('updatedDate'),
  // add more here later
  // todo: some page group definitions maybe dynamic
};

export function itemsToItemGroups<T extends ListItem>(
  items: T[],
  key?: DateKey
): ItemGroupProps<T>[] {
  if (!key) {
    return [
      {
        id: 'all',
        items: items,
        allItems: items,
      },
    ];
  }

  // assume pages are already sorted, we will use the page order to determine the group order
  const groupDefs = itemGroupDefinitions[key];
  const groups: ItemGroupProps<T>[] = [];

  for (const item of items) {
    // for a single page, there could be multiple groups that it belongs to
    const matchedGroups = groupDefs.filter(def => def.match(item));
    for (const groupDef of matchedGroups) {
      const group = groups.find(g => g.id === groupDef.id);
      if (group) {
        group.items.push(item);
      } else {
        const label =
          typeof groupDef.label === 'function'
            ? groupDef.label()
            : groupDef.label;
        groups.push({
          id: groupDef.id,
          label: label,
          items: [item],
          allItems: items,
        });
      }
    }
  }
  return groups;
}
