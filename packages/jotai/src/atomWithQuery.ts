import type { WritableAtom } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';
import { RESET } from 'jotai/vanilla/utils';
import type { NextRouter } from 'next/router'
type SetStateActionWithReset<Value> =
  | Value
  | typeof RESET
  | ((prev: Value) => Value | typeof RESET);

export function atomWithQuery(
  key: string,
  initialValue: string | null,
  options: {
    router: NextRouter
  },
): WritableAtom<string | null, [SetStateActionWithReset<string>], void> {
  const router = options.router;
  const subscribe = (callback: () => void) => {
    router.events.on('routeChangeComplete', callback)
    window.addEventListener('popstate', callback)
    return () => {
      router.events.off('routeChangeComplete', callback)
      window.removeEventListener('popstate', callback)
    }
  }
  const setQuery = (newValue: string | null) => void router.push({
    pathname: router.pathname,
    query: {
      ...router.query,
      [key]: newValue
    },
  });
  const strAtom = atom<string | null>(null);
  strAtom.onMount = (setAtom) => {
    if (typeof window === 'undefined' || !window.location) {
      return undefined;
    }
    const callback = () => {
      const str = router.query[key]
      if (typeof str === 'string') {
        setAtom(str);
      }
    };
    const unsubscribe = subscribe(callback);
    callback();
    return unsubscribe;
  };
  const valueAtom = atom<string | null>((get) => {
    const str = get(strAtom);
    return str === null ? initialValue : str;
  });
  return atom(
    (get) => get(valueAtom),
    (get, set, update: SetStateActionWithReset<string>) => {
      const nextValue =
        typeof update === 'function'
          ? (update as (prev: string | null) => string | typeof RESET)(get(valueAtom))
          : update;
      if (nextValue === RESET) {
        set(strAtom, null);
        setQuery(null);
      } else {
        const str = nextValue;
        set(strAtom, str);
        setQuery(str);
      }
    },
  );
}
