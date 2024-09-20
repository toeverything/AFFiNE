import './ask-ai-panel';

import { type EditorHost } from '@blocksuite/affine/block-std';
import {
  type AIItemGroupConfig,
  AIStarIcon,
  EdgelessRootService,
} from '@blocksuite/affine/blocks';
import { createLitPortal, HoverController } from '@blocksuite/affine/blocks';
import { assertExists, WithDisposable } from '@blocksuite/affine/global/utils';
import { flip, offset } from '@floating-ui/dom';
import { css, html, LitElement, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';

import { getRootService } from '../../utils/selection-utils';

type buttonSize = 'small' | 'middle' | 'large';
type toggleType = 'hover' | 'click';

const buttonWidthMap: Record<buttonSize, string> = {
  small: '72px',
  middle: '76px',
  large: '82px',
};

const buttonHeightMap: Record<buttonSize, string> = {
  small: '24px',
  middle: '32px',
  large: '32px',
};

export type AskAIButtonOptions = {
  size: buttonSize;
  backgroundColor?: string;
  boxShadow?: string;
  panelWidth?: number;
};

export class AskAIButton extends WithDisposable(LitElement) {
  get _edgeless() {
    const rootService = getRootService(this.host);
    if (rootService instanceof EdgelessRootService) {
      return rootService;
    }
    return null;
  }

  static override styles = css`
    .ask-ai-button {
      border-radius: 4px;
      position: relative;
      user-select: none;
    }

    .ask-ai-icon-button {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--affine-brand-color);
      font-size: var(--affine-font-sm);
      font-weight: 500;
    }

    .ask-ai-icon-button.small {
      font-size: var(--affine-font-xs);
      svg {
        scale: 0.8;
        margin-right: 2px;
      }
    }

    .ask-ai-icon-button.large {
      font-size: var(--affine-font-md);
      svg {
        scale: 1.2;
      }
    }

    .ask-ai-icon-button span {
      line-height: 22px;
    }

    .ask-ai-icon-button svg {
      margin-right: 4px;
      color: var(--affine-brand-color);
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
    size: 'middle',
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

    if (this._abortController) {
      this._clearAbortController();
      return;
    }

    this._abortController = new AbortController();
    assertExists(this._askAIButton);
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
    const { size = 'small', backgroundColor, boxShadow } = this.options;
    const { toggleType } = this;
    const buttonStyles = styleMap({
      backgroundColor: backgroundColor || 'transparent',
      boxShadow: boxShadow || 'none',
    });
    return html`<div
      class="ask-ai-button"
      style=${buttonStyles}
      ${toggleType === 'hover' ? ref(this._whenHover.setReference) : nothing}
      @click=${this._toggleAIPanel}
    >
      <icon-button
        class="ask-ai-icon-button ${size}"
        width=${buttonWidthMap[size]}
        height=${buttonHeightMap[size]}
      >
        ${AIStarIcon} <span>Ask AI</span></icon-button
      >
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ask-ai-button': AskAIButton;
  }
}
