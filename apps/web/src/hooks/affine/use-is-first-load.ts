import { useAtom } from 'jotai';

import { isFirstLoadAtom } from '../../atoms';

export function useIsFirstLoad() {
  const [isFirstLoad, setIsFirstLoad] = useAtom(isFirstLoadAtom);
  return [isFirstLoad, setIsFirstLoad] as const;
}
