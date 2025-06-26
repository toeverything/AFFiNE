import { createIdentifier } from '@blocksuite/global/di';
import { type Signal, signal } from '@preact/signals-core';

import { type DataViewExtensionType } from '../../core';

export const ShowQuickSettingBarKey = createIdentifier<
  Signal<Record<string, boolean>>
>('show-quick-setting-bar');

export const createDefaultShowQuickSettingBar = () => {
  return signal<Record<string, boolean>>({});
};

export function QuickSettingsBarExtension(
  value: Signal<Record<string, boolean>>
): DataViewExtensionType {
  return {
    setup({ di }) {
      di.addValue(ShowQuickSettingBarKey, value, { override: true });
    },
  };
}
