import { EdgelessToolIconButton } from './button/tool-icon-button';
import { EdgelessToolbarButton } from './button/toolbar-button';
import {
  EDGELESS_TOOLBAR_WIDGET,
  EdgelessToolbarWidget,
} from './edgeless-toolbar';
import { EdgelessSlideMenu } from './menu/slide-menu';
import { ToolbarArrowUpIcon } from './menu/toolbar-arrow-up-icon';
import { EdgelessFontFamilyPanel } from './panel/font-family-panel';
import { EdgelessFontWeightAndStylePanel } from './panel/font-weight-and-style-panel';

export function effects() {
  customElements.define(EDGELESS_TOOLBAR_WIDGET, EdgelessToolbarWidget);
  customElements.define('edgeless-toolbar-button', EdgelessToolbarButton);
  customElements.define('edgeless-tool-icon-button', EdgelessToolIconButton);
  customElements.define(
    'edgeless-font-weight-and-style-panel',
    EdgelessFontWeightAndStylePanel
  );
  customElements.define('edgeless-font-family-panel', EdgelessFontFamilyPanel);
  customElements.define('edgeless-slide-menu', EdgelessSlideMenu);
  customElements.define('toolbar-arrow-up-icon', ToolbarArrowUpIcon);
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-tool-icon-button': EdgelessToolIconButton;
    'edgeless-toolbar-button': EdgelessToolbarButton;
    'edgeless-toolbar-widget': EdgelessToolbarWidget;
    'edgeless-font-weight-and-style-panel': EdgelessFontWeightAndStylePanel;
    'edgeless-font-family-panel': EdgelessFontFamilyPanel;
    'edgeless-slide-menu': EdgelessSlideMenu;
    'toolbar-arrow-up-icon': ToolbarArrowUpIcon;
  }
}
