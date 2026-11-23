import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
import { LineWidth, type StrokeStyle } from '@blocksuite/affine-model';
import { LineStyleIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

export class EdgelessNoteBorderDropdownMenu extends ShadowlessElement {
  override render() {
    const { lineSize, lineStyle } = this;

    return html`
      <editor-menu-button
        .button=${html`
          <editor-icon-button
            aria-label="Border style"
            .tooltip="${'Border style'}"
          >
            ${LineStyleIcon()} ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <edgeless-line-styles-panel
          .lineSize=${lineSize}
          .lineStyle=${lineStyle}
        ></edgeless-line-styles-panel>
      </editor-menu-button>
    `;
  }

  @property({ attribute: false })
  accessor lineStyle!: StrokeStyle;

  @property({ attribute: false })
  accessor lineSize: LineWidth = LineWidth.Two;
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-note-border-dropdown-menu': EdgelessNoteBorderDropdownMenu;
  }
}
