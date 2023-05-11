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
        const newStack = prev.stack.slice(0, prev.current);
        newStack.push(url);
        return {
          stack: newStack,
          current: newStack.length - 1,
          skip: false,
        };
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
  (_, set, forward) => {
    if (forward) {
      set(historyBaseAtom, prev => ({
        ...prev,
        current: prev.current + 1,
        skip: true,
      }));
      window.history.forward();
    } else {
      set(historyBaseAtom, prev => ({
        ...prev,
        current: prev.current - 1,
        skip: true,
      }));
      window.history.back();
    }
  }
);
