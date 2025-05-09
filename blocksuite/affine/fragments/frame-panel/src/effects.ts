import {
  AFFINE_FRAME_PANEL_BODY,
  FramePanelBody,
} from './body/frame-panel-body';
import { AFFINE_FRAME_CARD, FrameCard } from './card/frame-card';
import {
  AFFINE_FRAME_CARD_TITLE,
  FrameCardTitle,
} from './card/frame-card-title';
import {
  AFFINE_FRAME_TITLE_EDITOR,
  FrameCardTitleEditor,
} from './card/frame-card-title-editor';
import { AFFINE_FRAME_PREVIEW, FramePreview } from './card/frame-preview';
import { AFFINE_FRAME_PANEL, FramePanel } from './frame-panel';
import {
  AFFINE_FRAME_PANEL_HEADER,
  FramePanelHeader,
} from './header/frame-panel-header';
import {
  AFFINE_FRAMES_SETTING_MENU,
  FramesSettingMenu,
} from './header/frames-setting-menu';

export function effects() {
  customElements.define(AFFINE_FRAME_PANEL, FramePanel);
  customElements.define(AFFINE_FRAME_TITLE_EDITOR, FrameCardTitleEditor);
  customElements.define(AFFINE_FRAME_CARD, FrameCard);
  customElements.define(AFFINE_FRAME_CARD_TITLE, FrameCardTitle);
  customElements.define(AFFINE_FRAME_PANEL_BODY, FramePanelBody);
  customElements.define(AFFINE_FRAME_PANEL_HEADER, FramePanelHeader);
  customElements.define(AFFINE_FRAMES_SETTING_MENU, FramesSettingMenu);
  customElements.define(AFFINE_FRAME_PREVIEW, FramePreview);
}
