import { useCallback, useSyncExternalStore } from 'react';

interface FeatureFlag {
  enableIndexedDBProvider: boolean;
}

export const defaultRecord: FeatureFlag = {
  enableIndexedDBProvider: true,
} as const;

const featureFlag = {
  record: {
    enableIndexedDBProvider: true,
  } as FeatureFlag,
  callback: new Set<() => void>(),
};

declare global {
  // eslint-disable-next-line no-var
  var featureFlag: {
    record: FeatureFlag;
    callback: Set<() => void>;
  };
}
if (!globalThis.featureFlag) {
  globalThis.featureFlag = featureFlag;
}

export const getFeatureFlag = <Key extends keyof FeatureFlag>(key: Key) =>
  featureFlag.record[key];

export function useFeatureFlag<Key extends keyof FeatureFlag>(
  key: Key
): FeatureFlag[Key] {
  return useSyncExternalStore(
    useCallback(onStoreChange => {
      featureFlag.callback.add(onStoreChange);
      return () => {
        featureFlag.callback.delete(onStoreChange);
      };
    }, []),
    useCallback(() => featureFlag.record[key], [key]),
    useCallback(() => defaultRecord[key], [key])
  );
}
