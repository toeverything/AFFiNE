import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import router from 'next/router';

export type History = {
  stack: string[];
  current: number;
  skip: boolean;
};

export const historyBaseAtom = atomWithStorage<History>('history', {
  stack: [],
  current: 0,
  skip: false,
});

historyBaseAtom.onMount = set => {
  const callback = (url: string) => {
    set(prev => {
      if (prev.skip) {
        return {
          stack: [...prev.stack],
          current: prev.current,
          skip: false,
        };
      } else {
        return {
          stack: [...prev.stack, url],
          current: prev.current + 1,
          skip: false,
        };
      }
    });
  };

  router.events.on('routeChangeComplete', callback);
  return () => {
    router.events.off('routeChangeComplete', callback);
  };
};

export const historyAtom = atom<History, [forward: boolean], void>(
  get => get(historyBaseAtom),
  (_, set, forward) => {
    if (forward) {
      set(historyBaseAtom, prev => ({
        ...prev,
        current: prev.current + 1,
        skip: true,
      }));
      router.forward();
    } else {
      set(historyBaseAtom, prev => ({
        ...prev,
        current: prev.current - 1,
        skip: true,
      }));
      router.back();
    }
  }
);
