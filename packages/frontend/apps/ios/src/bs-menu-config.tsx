import { NavigationGestureService } from '@affine/core/mobile/modules/navigation-gesture';
import { onMenuOpen } from '@blocksuite/affine/components/context-menu';
import { useService } from '@toeverything/infra';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';

export const BlocksuiteMenuConfigProvider = ({
  children,
}: PropsWithChildren) => {
  const navigationGesture = useService(NavigationGestureService);
  const menuCountRef = useRef(0);
  const prevEnabledRef = useRef(false);

  const handleMenuState = useCallback(() => {
    const currentCount = menuCountRef.current + 1;
    menuCountRef.current = currentCount;

    if (currentCount === 1) {
      prevEnabledRef.current = navigationGesture.enabled$.value;
      if (prevEnabledRef.current) {
        navigationGesture.setEnabled(false);
      }
    }

    return () => {
      const currentCount = menuCountRef.current - 1;
      menuCountRef.current = currentCount;

      if (currentCount === 0 && prevEnabledRef.current) {
        navigationGesture.setEnabled(true);
      }
    };
  }, [navigationGesture]);

  useEffect(() => {
    return onMenuOpen(() => {
      return handleMenuState();
    });
  }, [handleMenuState]);

  return children;
};
