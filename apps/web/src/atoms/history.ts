import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Router from 'next/router';

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
        if (prev.current < prev.stack.length - 1) {
          const newStack = prev.stack.slice(0, prev.current);
          newStack.push(url);
          return {
            stack: newStack,
            current: newStack.length - 1,
            skip: false,
          };
        } else {
          return {
            stack: [...prev.stack, url],
            current: prev.stack.length - 1,
            skip: false,
          };
        }
      }
    });
  };

  Router.events.on('routeChangeComplete', callback);
  return () => {
    Router.events.off('routeChangeComplete', callback);
  };
};

export const historyAtom = atom<History, [forward: boolean], void>(
  get => get(historyBaseAtom),
  (get, set, forward) => {
    if (forward) {
      const target = Math.min(
        get(historyBaseAtom).stack.length - 1,
        get(historyBaseAtom).current + 1
      );
      const url = get(historyBaseAtom).stack[target];
      set(historyBaseAtom, prev => ({
        ...prev,
        current: target,
        skip: true,
      }));
      void Router.push(url);
    } else {
      const target = Math.max(0, get(historyBaseAtom).current - 1);
      const url = get(historyBaseAtom).stack[target];
      set(historyBaseAtom, prev => ({
        ...prev,
        current: target,
        skip: true,
      }));
      void Router.push(url);
    }
  }
);
