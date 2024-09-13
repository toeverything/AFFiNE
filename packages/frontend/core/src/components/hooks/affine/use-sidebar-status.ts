import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { appSidebarOpenAtom } from '../../../components/app-sidebar';

export function useSwitchSidebarStatus() {
  const [isOpened, setOpened] = useAtom(appSidebarOpenAtom);

  const onOpenChange = useCallback(() => {
    setOpened(open => !open);
  }, [setOpened]);

  return useMemo(
    () => ({
      onOpenChange,
      isOpened,
    }),
    [isOpened, onOpenChange]
  );
}
