import { createVar } from '@vanilla-extract/css';

export const globalVars = {
  /**
   * The height of the keyboard, it will update when the keyboard is open or closed
   */
  appKeyboardHeight: createVar('appKeyboardHeight'),
  /**
   * The height of the keyboard, it will not update when the keyboard is open or closed
   * for dynamic height, use appKeyboardHeight instead
   */
  appKeyboardStaticHeight: createVar('appKeyboardStaticHeight'),
  appTabHeight: createVar('appTabHeight'),
  appTabSafeArea: createVar('appTabSafeArea'),
};
