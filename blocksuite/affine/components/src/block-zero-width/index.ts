import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { type BlockComponent, TextSelection } from '@blocksuite/std';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class BlockZeroWidth extends LitElement {
  static override styles = css`
    .block-zero-width {
      position: absolute;
      bottom: -15px;
      height: 10px;
      width: 100%;
      cursor: text;
      z-index: 1;
    }
  `;

  _handleClick = (e: MouseEvent) => {
    stopPropagation(e);
    if (this.block.store.readonly) return;
    const nextBlock = this.block.store.getNext(this.block.model);
    if (nextBlock?.flavour !== 'affine:paragraph') {
      const [paragraphId] = this.block.store.addSiblingBlocks(
        this.block.model,
        [{ flavour: 'affine:paragraph' }]
      );
      const std = this.block.std;
      std.selection.setGroup('note', [
        std.selection.create(TextSelection, {
          from: { blockId: paragraphId, index: 0, length: 0 },
          to: null,
        }),
      ]);
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('click', this._handleClick);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('click', this._handleClick);
    super.disconnectedCallback();
  }

  override render() {
    return html`<div class="block-zero-width"></div>`;
  }

  @property({ attribute: false })
  accessor block!: BlockComponent;
}

declare global {
  interface HTMLElementTagNameMap {
    'block-zero-width': BlockZeroWidth;
  }
}
