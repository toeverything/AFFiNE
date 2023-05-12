import { atom } from 'jotai';
import Router from 'next/router';

export type History = {
  stack: string[];
  current: number;
  skip: boolean;
};

export const MAX_HISTORY = 50;

export const historyBaseAtom = atom<History>({
  stack: [],
  current: 0,
  skip: false,
});

historyBaseAtom.onMount = set => {
  const callback = (url: string) => {
    set(prev => {
      console.log('push', url, prev.stack.length, prev.current);
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
          if (newStack.length > MAX_HISTORY) {
            newStack.shift();
          }
          return {
            stack: newStack,
            current: newStack.length - 1,
            skip: false,
          };
        } else {
          const newStack = [...prev.stack, url];
          if (newStack.length > MAX_HISTORY) {
            newStack.shift();
          }
          return {
            stack: newStack,
            current: newStack.length - 1,
            skip: false,
          };
        }
      }
    });
  };

  Router.events.on('routeChangeStart', callback);
  return () => {
    Router.events.off('routeChangeStart', callback);
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
