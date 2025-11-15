import { createLitPortal } from '@blocksuite/affine-components/portal';
import type {
  EditorIconButton,
  MenuItemGroup,
} from '@blocksuite/affine-components/toolbar';
import { renderGroups } from '@blocksuite/affine-components/toolbar';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { WithDisposable } from '@blocksuite/global/lit';
import { noop } from '@blocksuite/global/utils';
import { MoreVerticalIcon } from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { CodeBlockToolbarContext } from '../context.js';

export class AffineCodeToolbar extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      width: 100%;
      top: 0;
      left: 0;
    }

    .code-toolbar-container {
      width: auto;
      height: 24px;
      gap: 4px;
      padding: 4px;
      margin: 0;
      display: flex;
    }

    .code-toolbar-button {
      color: ${unsafeCSSVarV2('icon/primary')};
      background-color: ${unsafeCSSVarV2('button/secondary')};
      box-shadow: var(--affine-shadow-1);
      border-radius: 4px;
    }
  `;

  private _currentOpenMenu: AbortController | null = null;

  private _popMenuAbortController: AbortController | null = null;

  closeCurrentMenu = () => {
    if (this._currentOpenMenu && !this._currentOpenMenu.signal.aborted) {
      this._currentOpenMenu.abort();
      this._currentOpenMenu = null;
    }
  };

  private _toggleMoreMenu() {
    if (
      this._currentOpenMenu &&
      !this._currentOpenMenu.signal.aborted &&
      this._currentOpenMenu === this._popMenuAbortController
    ) {
      this.closeCurrentMenu();
      this._moreMenuOpen = false;
      return;
    }

    this.closeCurrentMenu();
    this._popMenuAbortController = new AbortController();
    this._popMenuAbortController.signal.addEventListener('abort', () => {
      this._moreMenuOpen = false;
      this.onActiveStatusChange(false);
    });
    this.onActiveStatusChange(true);

    this._currentOpenMenu = this._popMenuAbortController;

    if (!this._moreButton) {
      console.error(
        'Failed to open more menu in code toolbar! Unexpected missing more button'
      );
      return;
    }

    createLitPortal({
      template: html`
        <editor-menu-content
          data-show
          class="more-popup-menu"
          style=${styleMap({
            '--content-padding': '8px',
            '--packed-height': '4px',
          })}
        >
          <div data-size="large" data-orientation="vertical">
            ${renderGroups(this.moreGroups, this.context)}
          </div>
        </editor-menu-content>
      `,
      // should be greater than block-selection z-index as selection and popover wil share the same stacking context(editor-host)
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: this.context.host,
      computePosition: {
        referenceElement: this._moreButton,
        placement: 'bottom-start',
        middleware: [flip(), offset(4)],
        autoUpdate: { animationFrame: true },
      },
      abortController: this._popMenuAbortController,
      closeOnClickAway: true,
    });
    this._moreMenuOpen = true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.closeCurrentMenu();
  }

  override render() {
    return html`
      <editor-toolbar class="code-toolbar-container" data-without-bg>
        ${renderGroups(this.primaryGroups, this.context)}
        <editor-icon-button
          class="code-toolbar-button more"
          data-testid="more"
          aria-label="More"
          .tooltip=${'More'}
          .tooltipOffset=${4}
          .iconSize=${'16px'}
          .iconContainerPadding=${4}
          .showTooltip=${!this._moreMenuOpen}
          ?disabled=${this.context.doc.readonly}
          @click=${() => this._toggleMoreMenu()}
        >
          ${MoreVerticalIcon()}
        </editor-icon-button>
      </editor-toolbar>
    `;
  }

  @query('.code-toolbar-button.more')
  private accessor _moreButton!: EditorIconButton;

  @state()
  private accessor _moreMenuOpen = false;

  @property({ attribute: false })
  accessor context!: CodeBlockToolbarContext;

  @property({ attribute: false })
  accessor moreGroups!: MenuItemGroup<CodeBlockToolbarContext>[];

  @property({ attribute: false })
  accessor onActiveStatusChange: (active: boolean) => void = noop;

  @property({ attribute: false })
  accessor primaryGroups!: MenuItemGroup<CodeBlockToolbarContext>[];
}
