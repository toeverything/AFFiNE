import {
  AFFINE_KEYBOARD_TOOLBAR_WIDGET,
  AffineKeyboardToolbarWidget,
} from './index.js';
import {
  AFFINE_KEYBOARD_TOOL_PANEL,
  AffineKeyboardToolPanel,
} from './keyboard-tool-panel.js';
import {
  AFFINE_KEYBOARD_TOOLBAR,
  AffineKeyboardToolbar,
} from './keyboard-toolbar.js';

export function effects() {
  customElements.define(
    AFFINE_KEYBOARD_TOOLBAR_WIDGET,
    AffineKeyboardToolbarWidget
  );
  customElements.define(AFFINE_KEYBOARD_TOOLBAR, AffineKeyboardToolbar);
  customElements.define(AFFINE_KEYBOARD_TOOL_PANEL, AffineKeyboardToolPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_KEYBOARD_TOOLBAR]: AffineKeyboardToolbar;
    [AFFINE_KEYBOARD_TOOL_PANEL]: AffineKeyboardToolPanel;
  }
}
