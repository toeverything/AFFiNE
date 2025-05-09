import type { FrameBlockModel } from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';
import type * as Y from 'yjs';

import { FrameCardTitleEditor } from './frame-card-title-editor.js';

const styles = css`
  .frame-card-title-container {
    display: flex;
    white-space: nowrap;
    display: flex;
    justify-content: start;
    align-items: center;
    width: 100%;
    height: 20px;
    box-sizing: border-box;
    gap: 6px;
    font-size: var(--affine-font-sm);
    cursor: default;
    position: relative;
  }

  .frame-card-title-container .card-index {
    display: flex;
    align-self: center;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    box-sizing: border-box;
    border-radius: 2px;
    background: var(--affine-black);
    margin-left: 2px;

    color: var(--affine-white);
    text-align: center;
    font-weight: 500;
    line-height: 18px;
  }

  .frame-card-title-container .card-title {
    height: 20px;
    color: var(--affine-text-primary-color);
    font-weight: 400;
    line-height: 20px;

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
`;

export const AFFINE_FRAME_CARD_TITLE = 'affine-frame-card-title';

export class FrameCardTitle extends WithDisposable(ShadowlessElement) {
  static override styles = styles;

  private readonly _clearTitleDisposables = () => {
    this._titleDisposables?.dispose();
    this._titleDisposables = null;
  };

  private readonly _mountTitleEditor = (e: MouseEvent) => {
    e.stopPropagation();

    const titleEditor = new FrameCardTitleEditor();
    titleEditor.frameModel = this.frame;
    titleEditor.titleContentElement = this.titleContentElement;
    const left = this.titleIndexElement.offsetWidth + 6;
    titleEditor.left = left;
    titleEditor.maxWidth = this.titleContainer.offsetWidth - left - 6;
    this.titleContainer.append(titleEditor);
  };

  private _titleDisposables: DisposableGroup | null = null;

  private readonly _updateElement = () => {
    this.requestUpdate();
  };

  private _setFrameDisposables(title: Y.Text) {
    this._clearTitleDisposables();
    title.observe(this._updateElement);
    this._titleDisposables = new DisposableGroup();
    this._titleDisposables.add({
      dispose: () => {
        title.unobserve(this._updateElement);
      },
    });
  }

  override connectedCallback() {
    super.connectedCallback();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTitleDisposables();
  }

  override render() {
    return html`<div class="frame-card-title-container">
      <div
        class="card-index"
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @dblclick=${(e: MouseEvent) => e.stopPropagation()}
      >
        ${this.cardIndex + 1}
      </div>
      <div class="card-title">
        <span
          @click=${(e: MouseEvent) => e.stopPropagation()}
          @dblclick=${this._mountTitleEditor}
          >${this.frame.props.title}</span
        >
      </div>
    </div>`;
  }

  override updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('frame')) {
      this._setFrameDisposables(this.frame.props.title.yText);
    }
  }

  @property({ attribute: false })
  accessor cardIndex!: number;

  @property({ attribute: false })
  accessor frame!: FrameBlockModel;

  @query('.frame-card-title-container')
  accessor titleContainer!: HTMLElement;

  @query('.frame-card-title-container .card-title')
  accessor titleContentElement!: HTMLElement;

  @query('.frame-card-title-container .card-index')
  accessor titleIndexElement!: HTMLElement;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_FRAME_CARD_TITLE]: FrameCardTitle;
  }
}
