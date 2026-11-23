import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { consume } from '@lit/context';
import { html } from 'lit';

import { type TocContext, tocContext } from '../config';
import * as styles from './outline-setting-menu.css';

export const AFFINE_OUTLINE_NOTE_PREVIEW_SETTING_MENU =
  'affine-outline-note-preview-setting-menu';

export class OutlineNotePreviewSettingMenu extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  override render() {
    const showPreviewIcon = this._context.showIcons$.value;

    return html`<div
      class=${styles.notePreviewSettingMenuContainer}
      @click=${(e: MouseEvent) => e.stopPropagation()}
    >
      <div class=${styles.notePreviewSettingMenuItem}>
        <div class=${styles.settingLabel}>Settings</div>
      </div>
      <div class="${styles.notePreviewSettingMenuItem} ${styles.action}">
        <div class=${styles.actionLabel}>Show type icon</div>
        <div class=${styles.toggleButton}>
          <toggle-switch
            .on=${showPreviewIcon}
            .onChange=${() => {
              this._context.showIcons$.value = !showPreviewIcon;
            }}
          ></toggle-switch>
        </div>
      </div>
    </div>`;
  }

  @consume({ context: tocContext })
  private accessor _context!: TocContext;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_OUTLINE_NOTE_PREVIEW_SETTING_MENU]: OutlineNotePreviewSettingMenu;
  }
}
