import type { FrameBlockModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

const styles = css`
  frame-card-title-editor rich-text .nowrap-lines::-webkit-scrollbar {
    display: none;
  }
`;

export const AFFINE_FRAME_TITLE_EDITOR = 'affine-frame-card-title-editor';

export class FrameCardTitleEditor extends WithDisposable(ShadowlessElement) {
  static override styles = styles;

  private readonly _isComposing = false;

  get inlineEditor() {
    return this.richText.inlineEditor;
  }

  private _unmount() {
    // dispose in advance to avoid execute `this.remove()` twice
    this.disposables.dispose();
    this.remove();
    this.titleContentElement.style.display = 'block';
  }

  override firstUpdated(): void {
    this.updateComplete
      .then(() => {
        if (this.inlineEditor === null) return;

        this.titleContentElement.style.display = 'none';

        this.inlineEditor.selectAll();

        this.inlineEditor.slots.renderComplete.subscribe(() => {
          this.requestUpdate();
        });

        const inlineEditorContainer = this.inlineEditor.rootElement;
        if (!inlineEditorContainer) return;

        this.disposables.addFromEvent(inlineEditorContainer, 'blur', () => {
          this._unmount();
        });
        this.disposables.addFromEvent(inlineEditorContainer, 'click', e => {
          e.stopPropagation();
        });
        this.disposables.addFromEvent(inlineEditorContainer, 'dblclick', e => {
          e.stopPropagation();
        });

        this.disposables.addFromEvent(inlineEditorContainer, 'keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter' && !this._isComposing) {
            this._unmount();
          }
        });
      })
      .catch(console.error);
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await this.richText?.updateComplete;
    return result;
  }

  override render() {
    const inlineEditorStyle = styleMap({
      transformOrigin: 'top left',
      borderRadius: '4px',
      maxWidth: `${this.maxWidth}px`,
      maxHeight: '20px',
      width: 'fit-content',
      height: '20px',
      fontSize: 'var(--affine-font-sm)',
      lineHeight: '20px',
      position: 'absolute',
      left: `${this.left}px`,
      top: '0px',
      minWidth: '8px',
      background: 'var(--affine-background-primary-color)',
      border: '1px solid var(--affine-primary-color)',
      color: 'var(--affine-text-primary-color)',
      boxShadow: '0px 0px 0px 2px rgba(30, 150, 235, 0.30)',
      zIndex: '1',
      display: 'block',
    });
    return html`<rich-text
      .yText=${this.frameModel.props.title.yText}
      .enableFormat=${false}
      .enableAutoScrollHorizontally=${true}
      .enableUndoRedo=${false}
      .wrapText=${false}
      style=${inlineEditorStyle}
    ></rich-text>`;
  }

  @property({ attribute: false })
  accessor frameModel!: FrameBlockModel;

  @property({ attribute: false })
  accessor left!: number;

  @property({ attribute: false })
  accessor maxWidth!: number;

  @query('rich-text')
  accessor richText!: RichText;

  @property({ attribute: false })
  accessor titleContentElement!: HTMLElement;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_FRAME_TITLE_EDITOR]: FrameCardTitleEditor;
  }
}
