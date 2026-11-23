import type {
  KeyboardSubToolbarConfig,
  KeyboardToolbarActionItem,
  KeyboardToolbarItem,
  KeyboardToolPanelConfig,
} from './config.js';

export function isKeyboardToolBarActionItem(
  item: KeyboardToolbarItem
): item is KeyboardToolbarActionItem {
  return 'action' in item;
}

export function isKeyboardSubToolBarConfig(
  item: KeyboardToolbarItem
): item is KeyboardSubToolbarConfig {
  return 'items' in item;
}

export function isKeyboardToolPanelConfig(
  item: KeyboardToolbarItem
): item is KeyboardToolPanelConfig {
  return 'groups' in item;
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
  // mm-dd hh:mm
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const strTime = `${month}-${day} ${hours}:${minutes}`;
  return strTime;
}
