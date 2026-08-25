import { ModalConfigContext } from '@affine/component';
import { useService } from '@toeverything/infra';
import { fallbackVar } from '@vanilla-extract/css';
import { useCallback, useMemo } from 'react';

import { MobileBackCoordinator } from '../modules/back-coordinator';
import { VirtualKeyboardService } from '../modules/virtual-keyboard';
import { globalVars } from '../styles/variables.css';

export const MobileModalConfigProvider = ({
  children,
}: React.PropsWithChildren) => {
  const backCoordinator = useService(MobileBackCoordinator);
  useService(VirtualKeyboardService);

  const onOpen = useCallback(
    (close: () => void) =>
      backCoordinator.registerVisual({ handle: close }).dispose,
    [backCoordinator]
  );
  const value = useMemo(
    () => ({
      onOpen,
      dynamicKeyboardHeight: fallbackVar(globalVars.appKeyboardHeight, '0px'),
    }),
    [onOpen]
  );

  return (
    <ModalConfigContext.Provider value={value}>
      {children}
    </ModalConfigContext.Provider>
  );
};
