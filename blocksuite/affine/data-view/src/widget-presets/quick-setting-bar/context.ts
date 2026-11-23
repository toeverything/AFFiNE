import { createIdentifier } from '@blocksuite/global/di';
import { type Signal, signal } from '@preact/signals-core';

export const ShowQuickSettingBarKey = createIdentifier<
  Signal<Record<string, boolean>>
>('show-quick-setting-bar');

export const createDefaultShowQuickSettingBar = () => {
  return signal<Record<string, boolean>>({});
};
