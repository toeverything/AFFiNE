import { createButtonPopper } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { SettingsIcon, SortIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { consume } from '@lit/context';
import { signal } from '@preact/signals-core';
import { html } from 'lit';
import { query } from 'lit/decorators.js';

import { type TocContext, tocContext } from '../config';
import * as styles from './outline-panel-header.css';

export const AFFINE_OUTLINE_PANEL_HEADER = 'affine-outline-panel-header';

export class OutlinePanelHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  private _notePreviewSettingMenuPopper: ReturnType<
    typeof createButtonPopper
  > | null = null;

  private readonly _settingPopperShow$ = signal(false);

  override firstUpdated() {
    this._notePreviewSettingMenuPopper = createButtonPopper({
      reference: this._noteSettingButton,
      popperElement: this._notePreviewSettingMenu,
      stateUpdated: ({ display }) => {
        this._settingPopperShow$.value = display === 'show';
      },
      mainAxis: 14,
      crossAxis: -30,
    });
    this.disposables.add(this._notePreviewSettingMenuPopper);
  }

  override render() {
    const sortingEnabled = this._context.enableSorting$.value;
    const showSettingPopper = this._settingPopperShow$.value;

    return html`<div class=${styles.container}>
        <div class=${styles.noteSettingContainer}>
          <span class=${styles.label}>Table of Contents</span>
          <edgeless-tool-icon-button
            data-testid="toggle-toc-setting-button"
            class="${showSettingPopper ? 'active' : ''}"
            .tooltip=${showSettingPopper ? '' : 'Preview Settings'}
            .tipPosition=${'bottom'}
            .active=${showSettingPopper}
            .activeMode=${'background'}
            @click=${() => this._notePreviewSettingMenuPopper?.toggle()}
          >
            ${SettingsIcon({ width: '20px', height: '20px' })}
          </edgeless-tool-icon-button>
        </div>
        <edgeless-tool-icon-button
          data-testid="toggle-notes-sorting-button"
          class="${sortingEnabled ? 'active' : ''}"
          .tooltip=${'Visibility and sort'}
          .tipPosition=${'left'}
          .iconContainerPadding=${0}
          .active=${sortingEnabled}
          .activeMode=${'color'}
          @click=${() => {
            this._context.enableSorting$.value = !sortingEnabled;
          }}
        >
          ${SortIcon({ width: '20px', height: '20px' })}
        </edgeless-tool-icon-button>
      </div>
      <div class=${styles.notePreviewSettingContainer}>
        <affine-outline-note-preview-setting-menu></affine-outline-note-preview-setting-menu>
      </div>`;
  }

  @query(`.${styles.notePreviewSettingContainer}`)
  private accessor _notePreviewSettingMenu!: HTMLDivElement;

  @query(`.${styles.noteSettingContainer}`)
  private accessor _noteSettingButton!: HTMLDivElement;

  @consume({ context: tocContext })
  private accessor _context!: TocContext;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_OUTLINE_PANEL_HEADER]: OutlinePanelHeader;
  }
}
