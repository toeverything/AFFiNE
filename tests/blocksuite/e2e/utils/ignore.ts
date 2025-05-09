import type { BlockSnapshot } from '@blocksuite/store';

export function ignoreFields(target: unknown, keys: string[]): unknown {
  if (Array.isArray(target)) {
    return target.map((item: unknown) => ignoreFields(item, keys));
  } else if (typeof target === 'object' && target !== null) {
    return Object.keys(target).reduce(
      (acc: Record<string, unknown>, key: string) => {
        if (keys.includes(key)) {
          acc[key] = '*';
        } else {
          acc[key] = ignoreFields(
            (target as Record<string, unknown>)[key],
            keys
          );
        }
        return acc;
      },
      {}
    );
  }
  return target;
}

export function ignoreSnapshotId(snapshot: BlockSnapshot) {
  const ignored = ignoreFields(snapshot, ['id']);
  return JSON.stringify(ignored, null, 2);
}
