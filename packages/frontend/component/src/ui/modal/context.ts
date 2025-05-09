import { createContext } from 'react';

type OnClose = (() => void) | undefined;
export interface ModalConfig {
  /**
   * add global callback for modal open,
   * return a function to handle close/unmount callback
   */
  onOpen?: () => OnClose;
  /**
   * For mobile
   */
  dynamicKeyboardHeight?: string | number;
}
export const ModalConfigContext = createContext<ModalConfig>({});

export const InsideModalContext = createContext<number>(0);
