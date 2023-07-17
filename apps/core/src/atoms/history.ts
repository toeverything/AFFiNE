import { atom, useAtom, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useCallback, useEffect } from 'react';

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

// fixme(himself65): don't use hooks, use atom lifecycle instead
export function useTrackRouterHistoryEffect() {
  const setBase = useSetAtom(historyBaseAtom);
  const router = useRouter();
  useEffect(() => {
    const callback = (url: string) => {
      setBase(prev => {
        console.log('push', url, prev.skip, prev.stack.length, prev.current);
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

    router.events.on('routeChangeComplete', callback);
    return () => {
      router.events.off('routeChangeComplete', callback);
    };
  }, [router.events, setBase]);
}

export function useHistoryAtom() {
  const router = useRouter();
  const [base, setBase] = useAtom(historyBaseAtom);
  return [
    base,
    useCallback(
      (forward: boolean) => {
        setBase(prev => {
          if (forward) {
            const target = Math.min(prev.stack.length - 1, prev.current + 1);
            const url = prev.stack[target];
            router.push(url).catch(err => {
              console.error(err);
            });
            return {
              ...prev,
              current: target,
              skip: true,
            };
          } else {
            const target = Math.max(0, prev.current - 1);
            const url = prev.stack[target];
            router.push(url).catch(err => {
              console.error(err);
            });
            return {
              ...prev,
              current: target,
              skip: true,
            };
          }
        });
      },
      [router, setBase]
    ),
  ] as const;
}
