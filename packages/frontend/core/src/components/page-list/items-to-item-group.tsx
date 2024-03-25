import type { ItemGroupDefinition, ItemGroupProps, ListItem } from './types';

export function itemsToItemGroups<T extends ListItem>(
  items: T[],
  groupDefs?: ItemGroupDefinition<T>[] | false
): ItemGroupProps<T>[] {
  if (!groupDefs) {
    return [
      {
        id: 'all',
        items: items,
        allItems: items,
      },
    ];
  }

  // assume pages are already sorted, we will use the page order to determine the group order
  let groups: ItemGroupProps<T>[] = groupDefs.map(groupDef => ({
    id: groupDef.id,
    label: undefined, // Will be set later
    items: [],
    allItems: items,
  }));

  for (const item of items) {
    // for a single page, there could be multiple groups that it belongs to
    const matchedGroups = groupDefs.filter(def => def.match(item));
    for (const groupDef of matchedGroups) {
      const group = groups.find(g => g.id === groupDef.id);
      if (group) {
        group.items.push(item);
      }
    }
  }

  // Now that all items have been added to groups, we can get the correct label for each group
  groups = groups
    .map(group => {
      const groupDef = groupDefs.find(def => def.id === group.id);
      if (groupDef) {
        if (typeof groupDef.label === 'function') {
          group.label = groupDef.label(group.items.length);
        } else {
          group.label = groupDef.label;
        }
      }
      return group;
    })
    .filter(group => group.items.length > 0);

  return groups;
}
