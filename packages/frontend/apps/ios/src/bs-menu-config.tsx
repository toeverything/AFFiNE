import { MobileBackCoordinator } from '@affine/core/mobile/modules/back-coordinator';
import { onMenuOpen } from '@blocksuite/affine/components/context-menu';
import { useService } from '@toeverything/infra';
import { type PropsWithChildren, useEffect } from 'react';

export const BlocksuiteMenuConfigProvider = ({
  children,
}: PropsWithChildren) => {
  const coordinator = useService(MobileBackCoordinator);

  useEffect(() => {
    return onMenuOpen(() => {
      return coordinator.registerVisual({
        interactive: false,
        handle: () => false,
      }).dispose;
    });
  }, [coordinator]);

  return children;
};
