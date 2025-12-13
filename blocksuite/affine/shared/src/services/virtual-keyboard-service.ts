import { createIdentifier } from '@blocksuite/global/di';
import type { ReadonlySignal } from '@preact/signals-core';

export interface VirtualKeyboardProvider {
  readonly visible$: ReadonlySignal<boolean>;
  readonly height$: ReadonlySignal<number>;
  /**
   * The static height of the keyboard, it should record the last non-zero height of virtual keyboard
   */
  readonly staticHeight$: ReadonlySignal<number>;
  /**
   * The safe area of the app tab, it will be used when the keyboard is open or closed
   */
  readonly appTabSafeArea$: ReadonlySignal<string>;
}

export interface VirtualKeyboardProviderWithAction extends VirtualKeyboardProvider {
  show: () => void;
  hide: () => void;
}

export const VirtualKeyboardProvider = createIdentifier<
  VirtualKeyboardProvider | VirtualKeyboardProviderWithAction
>('VirtualKeyboardProvider');

export function isVirtualKeyboardProviderWithAction(
  provider: VirtualKeyboardProvider
): provider is VirtualKeyboardProviderWithAction {
  return 'show' in provider && 'hide' in provider;
}
