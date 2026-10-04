import { signal } from '@preact/signals-core';

export const EDGELESS_SHORTCUT_STORAGE_KEY =
  'affine:keyboard-shortcuts:edgeless-tools';

export const edgelessToolShortcutDefaults = {
  select: 'v',
  text: 't',
  connector: 'c',
  pen: 'p',
  hand: 'h',
  note: 'n',
  eraser: 'e',
} as const;

export type EdgelessToolShortcutId = keyof typeof edgelessToolShortcutDefaults;
export type EdgelessToolShortcutOverrides = Partial<
  Record<EdgelessToolShortcutId, string>
>;

const shortcutIds = Object.keys(
  edgelessToolShortcutDefaults
) as EdgelessToolShortcutId[];
const reservedEdgelessShortcuts = new Set(['f', 'i', 'k', 's']);
const listeners = new Set<() => void>();
let cachedOverrides: EdgelessToolShortcutOverrides | undefined;

export const edgelessToolShortcutsVersion$ = signal(0);

const getStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const readOverrides = (): EdgelessToolShortcutOverrides => {
  const value = getStorage()?.getItem(EDGELESS_SHORTCUT_STORAGE_KEY);
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      shortcutIds.flatMap(id => {
        const shortcut = parsed[id];
        return typeof shortcut === 'string' && /^[a-z0-9]$/i.test(shortcut)
          ? [[id, shortcut.toLowerCase()]]
          : [];
      })
    );
  } catch {
    return {};
  }
};

export const getEdgelessToolShortcutOverrides = () =>
  (cachedOverrides ??= readOverrides());

export const getEdgelessToolShortcut = (id: EdgelessToolShortcutId) =>
  getEdgelessToolShortcutOverrides()[id] ?? edgelessToolShortcutDefaults[id];

export const subscribeEdgelessToolShortcuts = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const publish = (overrides: EdgelessToolShortcutOverrides) => {
  cachedOverrides = overrides;
  const storage = getStorage();
  if (storage) {
    if (Object.keys(overrides).length) {
      storage.setItem(EDGELESS_SHORTCUT_STORAGE_KEY, JSON.stringify(overrides));
    } else {
      storage.removeItem(EDGELESS_SHORTCUT_STORAGE_KEY);
    }
  }
  edgelessToolShortcutsVersion$.value++;
  listeners.forEach(listener => listener());
};

export const setEdgelessToolShortcut = (
  id: EdgelessToolShortcutId,
  shortcut: string
) => {
  const normalized = shortcut.toLowerCase();
  if (!/^[a-z0-9]$/.test(normalized)) {
    throw new Error('Edgeless tool shortcuts must be one letter or number.');
  }
  if (reservedEdgelessShortcuts.has(normalized)) return 'reserved';

  const conflict = shortcutIds.find(
    otherId => otherId !== id && getEdgelessToolShortcut(otherId) === normalized
  );
  if (conflict) return conflict;

  const overrides = { ...getEdgelessToolShortcutOverrides() };
  if (normalized === edgelessToolShortcutDefaults[id]) {
    delete overrides[id];
  } else {
    overrides[id] = normalized;
  }
  publish(overrides);
  return null;
};

export const resetEdgelessToolShortcut = (id: EdgelessToolShortcutId) => {
  const defaultShortcut = edgelessToolShortcutDefaults[id];
  const conflict = shortcutIds.find(
    otherId =>
      otherId !== id && getEdgelessToolShortcut(otherId) === defaultShortcut
  );
  if (conflict) return conflict;

  const overrides = { ...getEdgelessToolShortcutOverrides() };
  delete overrides[id];
  publish(overrides);
  return null;
};

export const resetEdgelessToolShortcuts = () => publish({});

export const formatEdgelessToolShortcut = (shortcut: string) =>
  shortcut.toUpperCase();
