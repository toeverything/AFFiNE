export type NamedVersionMap = Record<string, string>;

export type NamedVersionStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function namedVersionStorageKey(workspaceId: string, docId: string) {
  return `affine-named-version:${workspaceId}:${docId}`;
}

export function parseNamedVersions(
  raw: string | null | undefined
): NamedVersionMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const map: NamedVersionMap = {};
    for (const [timestamp, label] of Object.entries(parsed)) {
      if (typeof label === 'string' && label.trim()) {
        map[timestamp] = label.trim();
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function loadNamedVersions(
  storage: NamedVersionStorage,
  workspaceId: string,
  docId: string
) {
  return parseNamedVersions(
    storage.getItem(namedVersionStorageKey(workspaceId, docId))
  );
}

export function saveNamedVersionLabel(
  storage: NamedVersionStorage,
  workspaceId: string,
  docId: string,
  timestamp: string,
  label: string
) {
  const next = { ...loadNamedVersions(storage, workspaceId, docId) };
  const trimmed = label.trim();
  if (trimmed) next[timestamp] = trimmed;
  else delete next[timestamp];
  storage.setItem(
    namedVersionStorageKey(workspaceId, docId),
    JSON.stringify(next)
  );
  return next;
}

export function labelForVersion(map: NamedVersionMap, timestamp?: string) {
  if (!timestamp) return;
  return map[timestamp];
}
