import type {
  SlashMenuActionItem,
  SlashMenuConfig,
  SlashMenuContext,
  SlashMenuItem,
  SlashMenuSubMenu,
} from './types';

export function isActionItem(item: SlashMenuItem): item is SlashMenuActionItem {
  return 'action' in item;
}

export function isSubMenuItem(item: SlashMenuItem): item is SlashMenuSubMenu {
  return 'subMenu' in item;
}

export function slashItemClassName({ name }: SlashMenuItem) {
  return name.split(' ').join('-').toLocaleLowerCase();
}

export function parseGroup(group: NonNullable<SlashMenuItem['group']>) {
  return [
    parseInt(group.split('_')[0]),
    group.split('_')[1].split('@')[0],
    parseInt(group.split('@')[1]),
  ] as const;
}

function itemCompareFn(a: SlashMenuItem, b: SlashMenuItem) {
  if (a.group === undefined && b.group === undefined) return 0;
  if (a.group === undefined) return -1;
  if (b.group === undefined) return 1;

  const [aGroupIndex, aGroupName, aItemIndex] = parseGroup(a.group);
  const [bGroupIndex, bGroupName, bItemIndex] = parseGroup(b.group);
  if (isNaN(aGroupIndex)) return -1;
  if (isNaN(bGroupIndex)) return 1;
  if (aGroupIndex < bGroupIndex) return -1;
  if (aGroupIndex > bGroupIndex) return 1;

  if (aGroupName !== bGroupName) return aGroupName.localeCompare(bGroupName);

  if (isNaN(aItemIndex)) return -1;
  if (isNaN(bItemIndex)) return 1;

  return aItemIndex - bItemIndex;
}

export function buildSlashMenuItems(
  items: SlashMenuItem[],
  context: SlashMenuContext,
  transform?: (item: SlashMenuItem) => SlashMenuItem
): SlashMenuItem[] {
  if (transform) items = items.map(transform);

  const result = items
    .filter(item => (item.when ? item.when(context) : true))
    .sort(itemCompareFn)
    .map(item => {
      if (isSubMenuItem(item)) {
        return {
          ...item,
          subMenu: buildSlashMenuItems(item.subMenu, context),
        };
      } else {
        return { ...item };
      }
    });
  return result;
}

export function mergeSlashMenuConfigs(
  configs: Map<string, SlashMenuConfig>
): SlashMenuConfig {
  return {
    items: ctx =>
      Array.from(configs.values()).flatMap(({ items }) =>
        typeof items === 'function' ? items(ctx) : items
      ),
    disableWhen: ctx =>
      configs
        .values()
        .map(({ disableWhen }) => disableWhen?.(ctx) ?? false)
        .some(Boolean),
  };
}

export function formatDate(date: Date) {
  // yyyy-mm-dd
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const strTime = `${year}-${month}-${day}`;
  return strTime;
}

export function formatTime(date: Date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const strTime = `${formatDate(date)} ${hours}:${minutes}`;
  return strTime;
}
