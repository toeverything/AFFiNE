import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

export function useSidebarStatus() {
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
