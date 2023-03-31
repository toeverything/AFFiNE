import { createJSONStorage, RESET } from 'jotai/utils';
import { atom } from 'jotai/vanilla';

const storage = createJSONStorage<any>(() =>
  typeof window !== 'undefined'
    ? window.localStorage
    : (undefined as unknown as Storage)
);

type SetStateActionWithReset<Value> =
  | Value
  | typeof RESET
  | ((prev: Value) => Value | typeof RESET);

// similar to atomWithStorage, but will not trigger twice on init
// https://github.com/pmndrs/jotai/discussions/1737
export function atomWithSyncStorage<Value>(key: string, initialValue: Value) {
  const storedValue = storage.getItem(key) as Value;
  const _value =
    typeof storedValue === 'symbol'
      ? initialValue
      : (storage.getItem(key) as Value);
  const baseAtom = atom(_value);

  baseAtom.onMount = setAtom => {
    if (storage.subscribe) {
      return storage.subscribe(key, setAtom);
    }
  };

  const anAtom = atom(
    get => get(baseAtom),
    (get, set, update: SetStateActionWithReset<Value>) => {
      const nextValue =
        typeof update === 'function'
          ? (update as (prev: Value) => Value | typeof RESET)(get(baseAtom))
          : update;
      if (nextValue === RESET) {
        set(baseAtom, initialValue);
        return storage.removeItem(key);
      }
      set(baseAtom, nextValue);
      return storage.setItem(key, nextValue);
    }
  );

  return anAtom;
}
