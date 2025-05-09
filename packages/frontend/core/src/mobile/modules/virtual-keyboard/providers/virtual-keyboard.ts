import { createIdentifier } from '@toeverything/infra';

interface VirtualKeyboardInfo {
  visible: boolean;
  height: number;
}

type VirtualKeyboardAction = {
  /**
   * Open the virtual keyboard, the focused element should not be changed
   */
  show: () => void;
  /**
   * Hide the virtual keyboard, the focused element should not be changed
   */
  hide: () => void;
};

type VirtualKeyboardEvent = {
  onChange: (callback: (info: VirtualKeyboardInfo) => void) => () => void;
};

export type VirtualKeyboardProvider =
  | (VirtualKeyboardEvent & VirtualKeyboardAction)
  | VirtualKeyboardEvent;

export const VirtualKeyboardProvider =
  createIdentifier<VirtualKeyboardProvider>('VirtualKeyboardProvider');
