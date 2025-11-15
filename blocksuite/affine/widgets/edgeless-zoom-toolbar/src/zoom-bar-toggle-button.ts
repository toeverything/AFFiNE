import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { MoreHorizontalIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { offset } from '@floating-ui/dom';
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';

export class ZoomBarToggleButton extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
    }
    .toggle-button {
      display: flex;
      position: relative;
    }
    edgeless-zoom-toolbar {
      position: absolute;
      bottom: initial;
    }
  `;

  private _abortController: AbortController | null = null;

  private _closeZoomMenu() {
    if (this._abortController && !this._abortController.signal.aborted) {
      this._abortController.abort();
      this._abortController = null;
      this._showPopper = false;
    }
  }

  private get _slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  private _toggleZoomMenu() {
    if (this._abortController && !this._abortController.signal.aborted) {
      this._closeZoomMenu();
      return;
    }

    this._abortController = new AbortController();
    this._abortController.signal.addEventListener('abort', () => {
      this._showPopper = false;
    });
    createLitPortal({
      template: html`<edgeless-zoom-toolbar
        .std=${this.std}
        .layout=${'vertical'}
      ></edgeless-zoom-toolbar>`,
      container: this._toggleButton,
      computePosition: {
        referenceElement: this._toggleButton,
        placement: 'top',
        middleware: [offset(4)],
        autoUpdate: true,
      },
      abortController: this._abortController,
      closeOnClickAway: true,
    });
    this._showPopper = true;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._closeZoomMenu();
  }

  override firstUpdated() {
    const { disposables } = this;
    disposables.add(
      this._slots.readonlyUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  override render() {
    if (this.std.store.readonly) {
      return nothing;
    }

    return html`
      <div class="toggle-button" @pointerdown=${stopPropagation}>
        <edgeless-tool-icon-button
          .tooltip=${'Toggle Zoom Tool Bar'}
          .tipPosition=${'right'}
          .active=${this._showPopper}
          .arrow=${false}
          .activeMode=${'background'}
          .iconContainerPadding=${6}
          .iconSize=${'24px'}
          @click=${() => this._toggleZoomMenu()}
        >
          ${MoreHorizontalIcon()}
        </edgeless-tool-icon-button>
      </div>
    `;
  }

  @state()
  private accessor _showPopper = false;

  @query('.toggle-button')
  private accessor _toggleButton!: HTMLElement;

  @property({ attribute: false })
  accessor std!: BlockStdScope;
}
