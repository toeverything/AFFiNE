import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export type History = {
  stack: string[];
  current: number;
  skip: boolean;
};

export const MAX_HISTORY = 50;

export const historyBaseAtom = atomWithStorage<History>('router-history', {
  stack: [],
  current: 0,
  skip: false,
});

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
