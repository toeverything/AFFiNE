import { EdgelessColorPickerButton } from './button';
import {
  EdgelessColorButton,
  EdgelessColorPanel,
  EdgelessTextColorIcon,
} from './color-panel';
import { EdgelessColorPicker } from './color-picker';
import { EdgelessColorCustomButton } from './custom-button';

export * from './button';
export * from './color-panel';
export * from './color-picker';
export * from './types';
export * from './utils';

export function effects() {
  customElements.define('edgeless-color-picker', EdgelessColorPicker);
  customElements.define(
    'edgeless-color-picker-button',
    EdgelessColorPickerButton
  );
  customElements.define(
    'edgeless-color-custom-button',
    EdgelessColorCustomButton
  );
  customElements.define('edgeless-color-button', EdgelessColorButton);
  customElements.define('edgeless-color-panel', EdgelessColorPanel);
  customElements.define('edgeless-text-color-icon', EdgelessTextColorIcon);
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-color-picker-button': EdgelessColorPickerButton;
    'edgeless-color-picker': EdgelessColorPicker;
    'edgeless-color-custom-button': EdgelessColorCustomButton;

    'edgeless-color-panel': EdgelessColorPanel;
    'edgeless-color-button': EdgelessColorButton;
    'edgeless-text-color-icon': EdgelessTextColorIcon;
  }
}
