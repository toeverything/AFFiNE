import { useAtom } from 'jotai';

import { pageModeSelectAtom } from '../atoms';

// TODO add scope, It should not share the same state between the all pages and the trash page
export const usePageModeSelect = (
  _scope: 'all' | 'trash' | 'shared' | 'public' = 'all'
) => {
  const [mode, setMode] = useAtom(pageModeSelectAtom);
  return [mode, setMode] as const;
};
