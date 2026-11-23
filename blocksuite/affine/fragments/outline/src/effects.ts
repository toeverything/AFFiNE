import { AFFINE_OUTLINE_NOTICE, OutlineNotice } from './body/outline-notice';
import {
  AFFINE_OUTLINE_PANEL_BODY,
  OutlinePanelBody,
} from './body/outline-panel-body';
import { AFFINE_OUTLINE_NOTE_CARD, OutlineNoteCard } from './card/outline-card';
import {
  AFFINE_OUTLINE_BLOCK_PREVIEW,
  OutlineBlockPreview,
} from './card/outline-preview';
import {
  AFFINE_OUTLINE_PANEL_HEADER,
  OutlinePanelHeader,
} from './header/outline-panel-header';
import {
  AFFINE_OUTLINE_NOTE_PREVIEW_SETTING_MENU,
  OutlineNotePreviewSettingMenu,
} from './header/outline-setting-menu';
import {
  AFFINE_MOBILE_OUTLINE_MENU,
  MobileOutlineMenu,
} from './mobile-outline-panel';
import { AFFINE_OUTLINE_PANEL, OutlinePanel } from './outline-panel';
import { AFFINE_OUTLINE_VIEWER, OutlineViewer } from './outline-viewer';

export function effects() {
  customElements.define(
    AFFINE_OUTLINE_NOTE_PREVIEW_SETTING_MENU,
    OutlineNotePreviewSettingMenu
  );
  customElements.define(AFFINE_OUTLINE_NOTICE, OutlineNotice);
  customElements.define(AFFINE_OUTLINE_PANEL, OutlinePanel);
  customElements.define(AFFINE_OUTLINE_PANEL_HEADER, OutlinePanelHeader);
  customElements.define(AFFINE_OUTLINE_NOTE_CARD, OutlineNoteCard);
  customElements.define(AFFINE_OUTLINE_VIEWER, OutlineViewer);
  customElements.define(AFFINE_MOBILE_OUTLINE_MENU, MobileOutlineMenu);
  customElements.define(AFFINE_OUTLINE_BLOCK_PREVIEW, OutlineBlockPreview);
  customElements.define(AFFINE_OUTLINE_PANEL_BODY, OutlinePanelBody);
}
