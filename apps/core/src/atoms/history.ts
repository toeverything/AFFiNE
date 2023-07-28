import { useAtom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { useCallback } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useNavigate } from 'react-router-dom';

import { router } from '../router';

export type History = {
  stack: string[];
  current: number;
  skip: boolean;
};

export const MAX_HISTORY = 50;

const historyBaseAtom = atomWithStorage<History>(
  'router-history',
  {
    stack: [],
    current: 0,
    skip: false,
  },
  createJSONStorage(() => sessionStorage)
);

historyBaseAtom.onMount = set => {
  const unsubscribe = router.subscribe(state => {
    set(prev => {
      const url = state.location.pathname;

      // if stack top is the same as current, skip
      if (prev.stack[prev.current] === url) {
        return prev;
      }

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
  });
  return () => {
    unsubscribe();
  };
};

export function useHistoryAtom() {
  const navigate = useNavigate();
  const [base, setBase] = useAtom(historyBaseAtom);
  return [
    base,
    useCallback(
      (forward: boolean) => {
        setBase(prev => {
          if (forward) {
            const target = Math.min(prev.stack.length - 1, prev.current + 1);
            const url = prev.stack[target];
            navigate(url);
            return {
              ...prev,
              current: target,
              skip: true,
            };
          } else {
            const target = Math.max(0, prev.current - 1);
            const url = prev.stack[target];
            navigate(url);
            return {
              ...prev,
              current: target,
              skip: true,
            };
          }
        });
      },
      [setBase, navigate]
    ),
  ] as const;
}
