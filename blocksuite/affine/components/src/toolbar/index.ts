import { effects as tooltipEffects } from '../tooltip/effect.js';
import { EditorIconButton } from './icon-button.js';
import {
  EditorMenuAction,
  EditorMenuButton,
  EditorMenuContent,
} from './menu-button.js';
import { EditorToolbarSeparator } from './separator.js';
import { EditorToolbar } from './toolbar.js';

export { EditorChevronDown } from './chevron-down.js';
export { ToolbarMoreMenuConfigExtension } from './config.js';
export { EditorIconButton } from './icon-button.js';
export {
  EditorMenuAction,
  EditorMenuButton,
  EditorMenuContent,
} from './menu-button.js';
export { MenuContext } from './menu-context.js';
export { EditorToolbarSeparator } from './separator.js';
export { darkToolbarStyles, lightToolbarStyles } from './styles.js';
export { EditorToolbar } from './toolbar.js';
export type {
  AdvancedMenuItem,
  FatMenuItems,
  MenuItem,
  MenuItemGroup,
  ToolbarMoreMenuConfig,
} from './types.js';
export {
  cloneGroups,
  getMoreMenuConfig,
  groupsToActions,
  renderActions,
  renderGroups,
  renderToolbarSeparator,
} from './utils.js';

export function effects() {
  tooltipEffects();

  customElements.define('editor-toolbar-separator', EditorToolbarSeparator);
  customElements.define('editor-toolbar', EditorToolbar);
  customElements.define('editor-icon-button', EditorIconButton);
  customElements.define('editor-menu-button', EditorMenuButton);
  customElements.define('editor-menu-content', EditorMenuContent);
  customElements.define('editor-menu-action', EditorMenuAction);
}
