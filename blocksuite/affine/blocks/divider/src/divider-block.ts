import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { DividerBlockModel } from '@blocksuite/affine-model';
import { BLOCK_CHILDREN_CONTAINER_PADDING_LEFT } from '@blocksuite/affine-shared/consts';
import { BlockSelection } from '@blocksuite/std';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { dividerBlockStyles } from './styles.js';

export class DividerBlockComponent extends CaptionedBlockComponent<DividerBlockModel> {
  static override styles = dividerBlockStyles;

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    this.handleEvent('click', () => {
      this.host.selection.setGroup('note', [
        this.host.selection.create(BlockSelection, {
          blockId: this.blockId,
        }),
      ]);
    });
  }

  override renderBlock() {
    const children = html`<div
      class="affine-block-children-container"
      style="padding-left: ${BLOCK_CHILDREN_CONTAINER_PADDING_LEFT}px"
    >
      ${this.renderChildren(this.model)}
    </div>`;

    const type = this.model.props.type$.value || 'solid';
    const color = 'var(--affine-divider-color, #e3e3e3)';
    const borderTopStyleMap: Record<string, string> = {
      solid: `1px solid ${color}`,
      dotted: `2px dotted ${color}`,
      dashed: `1px dashed ${color}`,
      'loosely-dashed': `2px dashed ${color}`,
      lines: `3px double ${color}`,
    };

    const hrStyle = styleMap({
      border: 'none',
      borderTop: borderTopStyleMap[type] || borderTopStyleMap.solid,
      width: '100%',
      margin: '0',
    });

    return html`
      <div class="affine-divider-block-container ${type}" data-type="${type}">
        <hr style=${hrStyle} />

        ${children}
      </div>
    `;
  }

  override accessor useZeroWidth = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-divider': DividerBlockComponent;
  }
}
