import type { FrameBlockModel } from '@blocksuite/affine-model';
import { createButtonPopper } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { LayerIcon } from '@blocksuite/icons/lit';
import type { BlockComponent } from '@blocksuite/std';
import { css, html, LitElement } from 'lit';
import { property, query } from 'lit/decorators.js';

import type { EdgelessFrameOrderMenu } from './frame-order-menu.js';

export class EdgelessFrameOrderButton extends WithDisposable(LitElement) {
  static override styles = css`
    edgeless-frame-order-menu {
      display: none;
    }

    edgeless-frame-order-menu[data-show] {
      display: initial;
    }
  `;

  private _edgelessFrameOrderPopper: ReturnType<
    typeof createButtonPopper
  > | null = null;

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._edgelessFrameOrderPopper?.dispose();
  }

  override firstUpdated() {
    this._edgelessFrameOrderPopper = createButtonPopper({
      reference: this._edgelessFrameOrderButton,
      popperElement: this._edgelessFrameOrderMenu,
      stateUpdated: ({ display }) => this.setPopperShow(display === 'show'),
      mainAxis: 22,
    });
  }

  protected override render() {
    const { readonly } = this.edgeless.store;
    return html`
      <style>
        .edgeless-frame-order-button svg {
          color: ${readonly ? 'var(--affine-text-disable-color)' : 'inherit'};
        }
      </style>
      <edgeless-tool-icon-button
        class="edgeless-frame-order-button"
        .iconSize=${'24px'}
        .tooltip=${this.popperShow ? '' : 'Frame Order'}
        @click=${() => {
          if (readonly) return;
          this._edgelessFrameOrderPopper?.toggle();
        }}
        .iconContainerPadding=${0}
      >
        ${LayerIcon()}
      </edgeless-tool-icon-button>
      <edgeless-frame-order-menu .edgeless=${this.edgeless}>
      </edgeless-frame-order-menu>
    `;
  }

  @query('.edgeless-frame-order-button')
  private accessor _edgelessFrameOrderButton!: HTMLElement;

  @query('edgeless-frame-order-menu')
  private accessor _edgelessFrameOrderMenu!: EdgelessFrameOrderMenu;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor frames!: FrameBlockModel[];

  @property({ attribute: false })
  accessor popperShow = false;

  @property({ attribute: false })
  accessor setPopperShow: (show: boolean) => void = () => {};
}
