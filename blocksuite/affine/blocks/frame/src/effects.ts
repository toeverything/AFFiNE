import { EdgelessFrameMenu, EdgelessFrameToolButton } from './edgeless-toolbar';
import { PresentationToolbar } from './edgeless-toolbar/presentation-toolbar';
import { FrameBlockComponent } from './frame-block';
import { EdgelessFrameOrderButton } from './present/frame-order-button';
import { EdgelessFrameOrderMenu } from './present/frame-order-menu';
import {
  EDGELESS_NAVIGATOR_BLACK_BACKGROUND_WIDGET,
  EdgelessNavigatorBlackBackgroundWidget,
} from './present/navigator-bg-widget';
import { EdgelessNavigatorSettingButton } from './present/navigator-setting-button';
import { EdgelessPresentButton } from './present/present-button';

export function effects() {
  customElements.define('affine-frame', FrameBlockComponent);
  customElements.define('edgeless-frame-tool-button', EdgelessFrameToolButton);
  customElements.define('edgeless-frame-menu', EdgelessFrameMenu);
  customElements.define(
    'edgeless-frame-order-button',
    EdgelessFrameOrderButton
  );
  customElements.define('edgeless-frame-order-menu', EdgelessFrameOrderMenu);
  customElements.define(
    'edgeless-navigator-setting-button',
    EdgelessNavigatorSettingButton
  );
  customElements.define('edgeless-present-button', EdgelessPresentButton);
  customElements.define('presentation-toolbar', PresentationToolbar);
  // Navigation components
  customElements.define(
    EDGELESS_NAVIGATOR_BLACK_BACKGROUND_WIDGET,
    EdgelessNavigatorBlackBackgroundWidget
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-frame': FrameBlockComponent;
    'edgeless-frame-tool-button': EdgelessFrameToolButton;
    'edgeless-frame-menu': EdgelessFrameMenu;
    'edgeless-frame-order-button': EdgelessFrameOrderButton;
    'edgeless-frame-order-menu': EdgelessFrameOrderMenu;
    'edgeless-navigator-setting-button': EdgelessNavigatorSettingButton;
    'edgeless-present-button': EdgelessPresentButton;
    'presentation-toolbar': PresentationToolbar;
    'edgeless-navigator-black-background': EdgelessNavigatorBlackBackgroundWidget;
  }
}
