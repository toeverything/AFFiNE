import { LassoMode } from '@blocksuite/affine-shared/types';
import { QuickToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { WithDisposable } from '@blocksuite/global/lit';
import { effect } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { query, state } from 'lit/decorators.js';

import { LassoFreeHandIcon, LassoPolygonalIcon } from './icons.js';

export class EdgelessLassoToolButton extends QuickToolMixin(
  WithDisposable(LitElement)
) {
  static override styles = css`
    .current-icon {
      transition: 100ms;
      width: 24px;
      height: 24px;
    }
    .current-icon > svg {
      display: block;
    }
  `;

  private readonly _changeTool = () => {
    const tool = this.edgelessTool;
    if (tool.type !== 'lasso') {
      this.setEdgelessTool({ type: 'lasso', mode: this.curMode });
      return;
    }

    this._fadeOut();
    setTimeout(() => {
      this.curMode === LassoMode.FreeHand
        ? this.setEdgelessTool({ type: 'lasso', mode: LassoMode.Polygonal })
        : this.setEdgelessTool({ type: 'lasso', mode: LassoMode.FreeHand });
      this._fadeIn();
    }, 100);
  };

  override type = 'lasso' as const;

  private _fadeIn() {
    this.currentIcon.style.opacity = '1';
    this.currentIcon.style.transform = `translateY(0px)`;
  }

  private _fadeOut() {
    this.currentIcon.style.opacity = '0';
    this.currentIcon.style.transform = `translateY(-5px)`;
  }

  override connectedCallback(): void {
    super.connectedCallback();

    this.disposables.add(
      effect(() => {
        const tool = this.gfx.tool.currentToolOption$.value;

        if (tool?.type === 'lasso') {
          const { mode } = tool;
          this.curMode = mode;
        }
      })
    );
  }

  override render() {
    const type = this.edgelessTool?.type;
    const mode = this.curMode === LassoMode.FreeHand ? 'freehand' : 'polygonal';

    return html`
      <edgeless-tool-icon-button
        class="edgeless-lasso-button ${mode}"
        .tooltip=${html`<affine-tooltip-content-with-shortcut
          data-tip="${'Lasso'}"
          data-shortcut="${'L'}"
        ></affine-tooltip-content-with-shortcut>`}
        .tooltipOffset=${17}
        .active=${type === 'lasso'}
        .iconContainerPadding=${6}
        .iconSize=${'24px'}
        @click=${this._changeTool}
      >
        <span class="current-icon">
          ${this.curMode === LassoMode.FreeHand
            ? LassoFreeHandIcon
            : LassoPolygonalIcon}
        </span>
        <toolbar-arrow-up-icon></toolbar-arrow-up-icon>
      </edgeless-tool-icon-button>
    `;
  }

  @state()
  accessor curMode: LassoMode = LassoMode.FreeHand;

  @query('.current-icon')
  accessor currentIcon!: HTMLInputElement;
}
