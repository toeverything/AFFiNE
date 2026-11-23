import './ask-ai-panel';

import { HoverController } from '@blocksuite/affine/components/hover';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { type EditorHost } from '@blocksuite/affine/std';
import { flip, offset } from '@floating-ui/dom';
import { css, html, LitElement, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { AIItemGroupConfig } from './ai-item/types';
import type { ButtonSize } from './ask-ai-icon';

type toggleType = 'hover' | 'click';

export type AskAIButtonOptions = {
  size: ButtonSize;
  backgroundColor?: string;
  boxShadow?: string;
  panelWidth?: number;
};

export class AskAIButton extends WithDisposable(LitElement) {
  static override styles = css`
    .ask-ai-button {
      border-radius: 4px;
      position: relative;
      user-select: none;
    }
  `;

  @query('.ask-ai-button')
  private accessor _askAIButton!: HTMLDivElement;

  private _abortController: AbortController | null = null;

  private readonly _whenHover = new HoverController(
    this,
    ({ abortController }) => {
      return {
        template: html`<ask-ai-panel
          .host=${this.host}
          .actionGroups=${this.actionGroups}
          .abortController=${abortController}
        ></ask-ai-panel>`,
        computePosition: {
          referenceElement: this,
          placement: 'bottom-start',
          middleware: [flip(), offset({ mainAxis: 8, crossAxis: -6 })],
          autoUpdate: true,
        },
      };
    },
    {
      allowMultiple: true,
      enterDelay: 100,
    }
  );

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor actionGroups!: AIItemGroupConfig[];

  @property({ attribute: false })
  accessor toggleType: toggleType = 'hover';

  @property({ attribute: false })
  accessor options: AskAIButtonOptions = {
    size: 'small',
    backgroundColor: undefined,
    boxShadow: undefined,
    panelWidth: 330,
  };

  private readonly _clearAbortController = () => {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  };

  private readonly _toggleAIPanel = () => {
    if (this.toggleType !== 'click') {
      return;
    }

    if (!this._askAIButton) {
      return;
    }

    if (this._abortController && !this._abortController.signal.aborted) {
      this._clearAbortController();
      return;
    }

    this._abortController = new AbortController();
    const panelMinWidth = this.options.panelWidth || 330;
    createLitPortal({
      template: html`<ask-ai-panel
        .host=${this.host}
        .actionGroups=${this.actionGroups}
        .minWidth=${panelMinWidth}
      ></ask-ai-panel>`,
      container: this._askAIButton,
      computePosition: {
        referenceElement: this._askAIButton,
        placement: 'bottom-start',
        middleware: [flip(), offset({ mainAxis: 8, crossAxis: -6 })],
        autoUpdate: true,
      },
      abortController: this._abortController,
      closeOnClickAway: true,
    });
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._clearAbortController();
  }

  override render() {
    const { size, backgroundColor, boxShadow } = this.options;
    const { toggleType } = this;
    const buttonStyles = styleMap({
      backgroundColor: backgroundColor || 'transparent',
      boxShadow: boxShadow || 'none',
    });
    return html`<div
      class="ask-ai-button"
      data-testid="ask-ai-button"
      style=${buttonStyles}
      ${toggleType === 'hover' ? ref(this._whenHover.setReference) : nothing}
      @click=${this._toggleAIPanel}
    >
      <ask-ai-icon .size=${size}></ask-ai-icon>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ask-ai-button': AskAIButton;
  }
}
